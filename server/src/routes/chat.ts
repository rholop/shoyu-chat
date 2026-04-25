import { Router } from 'express';
import { z } from 'zod';
import {
  getConversationMeta,
  getMessages,
  appendMessage,
  updateConversationTitle,
} from '../storage';
import { streamChat } from '../services/aiRouter';
import { schedule as scheduleSummary } from '../services/summaryService';
import { logger } from '../utils/logger';
import { isGroqAvailable } from '../services/groqService';
import { isGeminiAvailable } from '../services/geminiService';
import { isOpenRouterAvailable } from '../services/openrouterService';

const router = Router();

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(32000),
});

router.post('/send', async (req, res) => {
  // LOUD LOGGING
  console.log('--- NEW CHAT REQUEST ---');
  console.log('Body:', JSON.stringify(req.body));
  console.log('DEBUG KEYS:', {
  groq: !!process.env.GROQ_API_KEY,
  gemini: !!process.env.GEMINI_API_KEY,
  openrouter: !!process.env.OPENROUTER_API_KEY
});
  console.log('GROQ_LIMIT:', process.env.GROQ_CHAT_DAILY_LIMIT);
  console.log('Is Groq Available?', isGroqAvailable());
  console.log('Is Gemini Available?', isGeminiAvailable());
  console.log('Is OpenRouter Available?', isOpenRouterAvailable());

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    console.log('Zod Validation Failed:', parsed.error.format()); // LOG THIS
    res.status(400).json({ error: 'Invalid request', details: parsed.error.format() });
    return;
  }
});

router.post('/send', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { conversationId, content } = parsed.data;
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
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  try {
    history = getMessages(conversationId)
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  } catch (err) {
    logger.error('Failed to load message history:', err);
    send({ type: 'error', message: 'Failed to load conversation history.' });
    res.end();
    return;
  }

  // Add current user message to context
  const context = [...history, { role: 'user' as const, content }];

  let fullContent = '';
  let modelUsed = '';
  let aborted = false;

  req.on('close', () => { aborted = true; });

  try {
    for await (const { token, model } of streamChat(context)) {
      if (aborted) break;
      fullContent += token;
      modelUsed = model;
      if (!send({ type: 'token', content: token })) {
        aborted = true;
        break;
      }
    }

    if (!aborted && fullContent) {
      // Persist both messages
      try {
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
          // Non-critical, continue anyway
        }
      }

      try {
        scheduleSummary(conversationId);
      } catch (err) {
        logger.error('Failed to schedule summary:', err);
        // Non-critical, continue anyway
      }

      send({ type: 'done', model: modelUsed, conversationId });
    } else if (!aborted && !fullContent) {
      send({ type: 'error', message: 'No response generated. Please try again.' });
    }
  } catch (err) {
    logger.error('Chat stream error:', err);
    const message =
      err instanceof Error && err.message === 'QUOTA_EXCEEDED'
        ? 'All AI providers have reached their daily quota. Try again tomorrow.'
        : err instanceof Error && err.message.includes('rate limit')
        ? 'Rate limit exceeded. Please wait a moment and try again.'
        : err instanceof Error && err.message.includes('timeout')
        ? 'Request timed out. Please try again.'
        : 'An error occurred. Please try again.';
    send({ type: 'error', message });
  }

  // Ensure we always send a response if nothing was sent
  if (!aborted && !fullContent) {
    send({ type: 'error', message: 'No response from AI providers. Please try again.' });
  }

  res.end();
});

export default router;
