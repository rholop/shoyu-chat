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

const router = Router();

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(32000),
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

  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const now = new Date().toISOString();

  // Load history for AI context (last 20 messages)
  const history = getMessages(conversationId)
    .slice(-20)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

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
      send({ type: 'token', content: token });
    }

    if (!aborted && fullContent) {
      // Persist both messages
      appendMessage(conversationId, { role: 'user', content, created_at: now });
      appendMessage(conversationId, {
        role: 'assistant',
        content: fullContent,
        model: modelUsed,
        created_at: new Date().toISOString(),
      });

      // Auto-title from first user message
      if (meta.title === 'New Conversation') {
        const title = content.slice(0, 60).replace(/\n/g, ' ').trim();
        updateConversationTitle(conversationId, title);
      }

      scheduleSummary(conversationId);

      send({ type: 'done', model: modelUsed, conversationId });
    }
  } catch (err) {
    logger.error('Chat stream error:', err);
    const message =
      err instanceof Error && err.message === 'QUOTA_EXCEEDED'
        ? 'All AI providers have reached their daily quota. Try again tomorrow.'
        : 'An error occurred. Please try again.';
    send({ type: 'error', message });
  }

  res.end();
});

export default router;
