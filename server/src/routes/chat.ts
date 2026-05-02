import { Router } from 'express';
import { z } from 'zod';
import {
  getConversationMeta,
  getMessages,
  appendMessage,
  updateConversationTitle,
} from '../storage';
import { streamChat, Intent } from '../services/aiRouter';
import { schedule as scheduleSummary } from '../services/summaryService';
import { logger } from '../utils/logger';

const router = Router();

const intentValues = [
  'WEB_SEARCH',
  'CODING',
  'DEBUGGING',
  'TRANSLATING',
  'DRAFTING',
  'VISUALS',
  'DEFAULT',
] as const;

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(32000),
  intent: z.enum(intentValues).optional(),
});

router.post('/send', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { conversationId, content, intent = 'DEFAULT' } = parsed.data;
  const meta = getConversationMeta(conversationId);
  if (!meta) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  // Set SSE headers before any async work
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': warmup\n\n');

  const send = (payload: object) => {
    try {
      const data = `data: ${JSON.stringify(payload)}\n\n`;
      const canContinue = res.write(data);
      if (!canContinue) {
        logger.warn('SSE buffer full, client may have disconnected');
      }
      return canContinue;
    } catch (err) {
      logger.error('Failed to send SSE message:', err);
      return false;
    }
  };

  const now = new Date().toISOString();

  // Load history for AI context (last 20 messages)
  // Internal messages are mapped to user-role with a label so all providers understand them
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  try {
    history = getMessages(conversationId)
      .slice(-20)
      .map((m) => {
        if (m.role === 'internal') {
          return { role: 'user' as const, content: `[Search Context]\n${m.content}` };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      });
  } catch (err) {
    logger.error('Failed to load message history:', err);
    send({ type: 'error', message: 'Failed to load conversation history.' });
    res.end();
    return;
  }

  const context = [...history, { role: 'user' as const, content }];

  let fullContent = '';
  let modelUsed = '';
  let aborted = false;
  const internalMessages: string[] = [];

  res.on('close', () => { aborted = true; });

  try {
    const stream = await Promise.resolve(streamChat(context, intent as Intent));
    for await (const result of stream) {
      if (result.type === 'token') {
        fullContent += result.token;
        modelUsed = result.model;
        send({ type: 'token', content: result.token });
      } else if (result.type === 'internal') {
        internalMessages.push(result.content);
      }
      if (aborted) break;
    }

    if (fullContent && !aborted) {
      try {
        // Persist any internal (search grounding) messages first
        for (const internalContent of internalMessages) {
          appendMessage(conversationId, {
            role: 'internal',
            content: internalContent,
            model: modelUsed,
            created_at: now,
          });
        }
        appendMessage(conversationId, { role: 'user', content, created_at: now });
        appendMessage(conversationId, {
          role: 'assistant',
          content: fullContent,
          model: modelUsed,
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('Failed to persist messages:', err);
        send({ type: 'error', message: 'Failed to save messages.' });
        res.end();
        return;
      }

      // Auto-title from first user message
      if (meta.title === 'New Conversation') {
        try {
          const title = content.slice(0, 60).replace(/\n/g, ' ').trim();
          updateConversationTitle(conversationId, title);
        } catch (err) {
          logger.error('Failed to update conversation title:', err);
        }
      }

      try {
        scheduleSummary(conversationId);
      } catch (err) {
        logger.error('Failed to schedule summary:', err);
      }

      send({ type: 'done', model: modelUsed, conversationId });
    } else if (!fullContent) {
      send({ type: 'error', message: 'No response generated. Please try again.' });
    }
  } catch (err) {
    logger.error('Chat stream error:', err);
    const message =
      err instanceof Error && err.message === 'QUOTA_EXCEEDED'
        ? 'All AI providers have reached their daily quota. Try again tomorrow.'
        : err instanceof Error && err.message.toLowerCase().includes('rate limit')
        ? 'Rate limit exceeded. Please wait a moment and try again.'
        : err instanceof Error && err.message.toLowerCase().includes('timeout')
        ? 'Request timed out. Please try again.'
        : 'An error occurred. Please try again.';
    send({ type: 'error', message });
  }

  if (!res.writableEnded) {
    res.end();
  }
});

export default router;
