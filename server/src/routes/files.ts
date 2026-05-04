import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { uploadSingle } from '../middleware/uploadMiddleware';
import { getConversationMeta, conversationFilesDir } from '../storage';
import { findConversationFile } from '../services/fileService';
import { SearchExtractor } from '../services/searchExtractor';
import { SearchIndexService } from '../services/searchIndexService';
import { logger } from '../utils/logger';

const router = Router();

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

    // Index the file
    const meta = getConversationMeta(conversationId);
    if (meta) {
      SearchExtractor.fromFile('upload', req.file.path, conversationId, meta.title, meta.projectId || undefined)
        .then(records => records.forEach(r => SearchIndexService.indexRecord(r)))
        .catch(err => logger.error('Search indexing failed for upload:', err));
    }

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
  SearchIndexService.removeRecord(`upload-${conversationId}-${path.basename(found.filePath)}`); // This might be brittle if IDs change
  // Actually, removeRecord might need to be more robust or I should just use sourcePath
  // But SearchIndexService.removeRecordsBySourcePrefix(found.filePath) is better
  SearchIndexService.removeRecordsBySourcePrefix(found.filePath);
  res.json({ ok: true });
});

export default router;
