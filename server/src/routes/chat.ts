import { Router } from 'express';
import { z } from 'zod';
import {
  getConversationById,
  getMessages,
  insertMessage,
  touchConversation,
  updateConversationTitle,
} from '../db';
import { streamChat } from '../services/aiRouter';
import { schedule as scheduleSummary } from '../services/summaryService';
import { logger } from '../utils/logger';

const router = Router();

const sendSchema = z.object({
  conversationId: z.number().int().positive(),
  content: z.string().min(1).max(32000),
});

router.post('/send', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { conversationId, content } = parsed.data;
  const conversation = getConversationById(conversationId, req.user!.userId);
  if (!conversation) {
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

  // Save user message immediately
  insertMessage(conversationId, 'user', content);

  const history = getMessages(conversationId).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Keep last 20 messages for context to stay within token limits
  const context = history.slice(-20);

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
      const msgId = insertMessage(conversationId, 'assistant', fullContent, modelUsed);
      touchConversation(conversationId);

      // Auto-title the conversation from the first user message
      if (conversation.title === 'New Conversation') {
        const title = content.slice(0, 60).replace(/\n/g, ' ').trim();
        updateConversationTitle(conversationId, req.user!.userId, title);
      }

      scheduleSummary(conversationId);

      send({ type: 'done', model: modelUsed, messageId: msgId, conversationId });
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
