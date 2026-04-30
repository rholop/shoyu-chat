import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { uploadSingle } from '../middleware/uploadMiddleware';
import { getConversationMeta } from '../storage';
import { findConversationFile } from '../services/fileService';
import { logger } from '../utils/logger';

const router = Router();

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../../../data');

function conversationFilesDir(conversationId: string) {
  return path.join(DATA_DIR, 'conversations', conversationId);
}

router.post('/upload', (req, res) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      logger.error('Upload error:', err);
      res.status(400).json({ error: (err as Error).message ?? 'Upload failed' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const { conversationId } = req.body as { conversationId?: string };
    if (!conversationId || !getConversationMeta(conversationId)) {
      fs.rmSync(req.file.path, { force: true });
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const basename = path.basename(req.file.filename);
    const dashIdx = basename.indexOf('-');
    const fileId = dashIdx > 0 ? basename.slice(0, dashIdx) : basename;

    res.status(201).json({
      fileId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });
});

const fileParamsSchema = z.object({
  conversationId: z.string().uuid(),
  fileId: z.string().uuid(),
});

router.get('/:conversationId/:fileId', (req, res) => {
  const parsed = fileParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid parameters' });
    return;
  }

  const { conversationId, fileId } = parsed.data;
  const dir = conversationFilesDir(conversationId);
  const found = findConversationFile(dir, fileId);

  if (!found) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.sendFile(found.filePath);
});

router.delete('/:conversationId/:fileId', (req, res) => {
  const parsed = fileParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid parameters' });
    return;
  }

  const { conversationId, fileId } = parsed.data;
  const dir = conversationFilesDir(conversationId);
  const found = findConversationFile(dir, fileId);

  if (!found) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  fs.rmSync(found.filePath, { force: true });
  res.json({ ok: true });
});

export default router;
