import { Router } from 'express';
import { z } from 'zod';
import {
  getConversationMeta,
  getMessages,
  appendMessage,
  updateConversationTitle,
  conversationFilesDir,
  MessageAttachment,
} from '../storage';
import { streamChat, InternalNoteResult } from '../services/aiRouter';
import { extractContext, formatContextBlock, findConversationFile } from '../services/fileService';
import { schedule as scheduleSummary } from '../services/summaryService';
import { getContext as getProjectContext } from '../services/projectService';
import { ChatMessage, ImageAttachment } from '../services/groqService';
import { logger } from '../utils/logger';
import { Intent } from '../types';

const router = Router();

const attachmentSchema = z.object({
  fileId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().optional(),
});

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().max(32000),
  attachments: z.array(attachmentSchema).optional(),
  intent: z.nativeEnum(Intent).default(Intent.CODING),
});

router.post('/send', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { conversationId, content, attachments = [], intent } = parsed.data;

  if (!content.trim() && attachments.length === 0) {
    res.status(400).json({ error: 'Message must have content or attachments' });
    return;
  }

  const meta = getConversationMeta(conversationId);
  if (!meta) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': warmup\n\n');

  const send = (payload: object) => {
    try {
      const canContinue = res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (!canContinue) logger.warn('SSE buffer full, client may have disconnected');
      return canContinue;
    } catch (err) {
      logger.error('Failed to send SSE message:', err);
      return false;
    }
  };

  const now = new Date().toISOString();
  let aborted = false;
  res.on('close', () => { aborted = true; });

  // Load history (last 20 messages)
  let history: ChatMessage[] = [];
  try {
    const rawHistory = getMessages(conversationId).slice(-20);

    // Collect internal relay notes to inject as system context
    const internalNotes = rawHistory
      .filter((m) => m.role === 'internal')
      .map((m) => m.content)
      .join('\n\n');

    // Build system prompt from project context + internal notes
    let systemContent = '';
    if (meta.projectId) {
      const projectContext = getProjectContext(meta.projectId);
      if (projectContext.trim()) {
        systemContent += `# Project Context\n\n${projectContext}`;
      }
    }
    if (internalNotes) {
      if (systemContent) systemContent += '\n\n';
      systemContent += `# Research Notes (from previous web searches)\n\n${internalNotes}`;
    }
    if (systemContent) {
      history.push({ role: 'system', content: systemContent });
    }

    // Only pass user/assistant messages as conversation history
    const conversationHistory = rawHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    history.push(...conversationHistory);
  } catch (err) {
    logger.error('Failed to load message history:', err);
    send({ type: 'error', message: 'Failed to load conversation history.' });
    res.end();
    return;
  }

  // Process attachments: extract file contexts
  let userContent = content;
  const imageAttachments: ImageAttachment[] = [];

  if (attachments.length > 0) {
    const filesDir = conversationFilesDir(conversationId);
    const contextBlocks: string[] = [];

    for (const att of attachments) {
      const found = findConversationFile(filesDir, att.fileId);
      if (!found) {
        logger.warn(`File ${att.fileId} not found for conversation ${conversationId}`);
        continue;
      }

      try {
        const ctx = await extractContext(found.filePath, att.mimeType, att.filename);
        if (ctx.isImage && ctx.base64) {
          imageAttachments.push({ mimeType: ctx.mimeType, base64: ctx.base64, filename: ctx.filename });
        } else {
          const block = formatContextBlock(ctx);
          if (block) contextBlocks.push(block);
        }
      } catch (err) {
        logger.error(`Failed to extract context for file ${att.fileId}:`, err);
      }
    }

    if (contextBlocks.length > 0) {
      userContent = contextBlocks.join('\n\n') + (content.trim() ? `\n\n${content}` : '');
    }
  }

  const hasImages = imageAttachments.length > 0;
  const userMessage: ChatMessage = {
    role: 'user',
    content: userContent,
    ...(hasImages ? { images: imageAttachments } : {}),
  };
  const context: ChatMessage[] = [...history, userMessage];

  let fullContent = '';
  let modelUsed = '';

  try {
    const stream = streamChat(context, intent, hasImages);
    for await (const result of stream) {
      if ('internalNote' in (result as InternalNoteResult)) {
        const noteResult = result as InternalNoteResult;
        try {
          appendMessage(conversationId, {
            role: 'internal',
            content: noteResult.internalNote,
            model: noteResult.model,
            created_at: new Date().toISOString(),
          });
        } catch (err) {
          logger.error('Failed to persist internal note:', err);
        }
      } else {
        const { token, model } = result as { token: string; model: string };
        fullContent += token;
        modelUsed = model;
        send({ type: 'token', content: token });
        if (aborted) break;
      }
    }

    if (fullContent && !aborted) {
      const storedAttachments: MessageAttachment[] = attachments.map((a) => ({
        fileId: a.fileId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
      }));

      try {
        appendMessage(conversationId, {
          role: 'user',
          content,
          ...(storedAttachments.length > 0 ? { attachments: storedAttachments } : {}),
          created_at: now,
        });
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

      if (meta.title === 'New Conversation') {
        try {
          const title = content.slice(0, 60).replace(/\n/g, ' ').trim() || attachments[0]?.filename || 'Untitled';
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

  if (!res.writableEnded) res.end();
});

export default router;
