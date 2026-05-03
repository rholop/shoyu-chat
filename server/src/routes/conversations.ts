import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { z } from 'zod';
import {
  listConversations,
  getConversationMeta,
  getMessages,
  createConversation,
  updateConversationTitle,
  deleteConversation,
  assignConversationProject,
  conversationDownloadsDir,
} from '../storage';
import { getConversationDownloads } from '../services/fileService';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listConversations());
});

router.post('/', (req, res) => {
  const parsed = z.object({ projectId: z.string().uuid().nullable().optional() }).safeParse(req.body);
  const projectId = parsed.success ? (parsed.data.projectId ?? null) : null;
  const id = createConversation(projectId);
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const meta = getConversationMeta(id);
  if (!meta) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const rawMessages = getMessages(id);
  const messages = rawMessages.map((m, i) => ({
    id: i,
    conversation_id: id,
    role: m.role,
    content: m.content,
    model_used: m.model ?? null,
    created_at: m.created_at,
    attachments: m.attachments,
    downloads: m.downloads,
  }));
  res.json({ ...meta, updated_at: new Date().toISOString(), messages });
});

router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const parsed = z.object({ title: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid title' });
    return;
  }
  const ok = updateConversationTitle(id, parsed.data.title);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const ok = deleteConversation(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

router.post('/:id/assign', (req, res) => {
  const parsed = z
    .object({ projectId: z.string().uuid().nullable() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  const ok = assignConversationProject(req.params.id, parsed.data.projectId);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

// ── Download routes ────────────────────────────────────────────────────────────

router.get('/:id/downloads', async (req, res) => {
  const { id } = req.params;
  if (!getConversationMeta(id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const downloads = await getConversationDownloads(id);
  res.json(downloads);
});

const downloadParamsSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
});

router.get('/:id/downloads/:fileId', (req, res) => {
  const parsed = downloadParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid parameters' });
    return;
  }

  const { id, fileId } = parsed.data;
  if (!getConversationMeta(id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const downloadsDir = conversationDownloadsDir(id);
  if (!fs.existsSync(downloadsDir)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const files = fs.readdirSync(downloadsDir).filter(
    (f) => f !== '.versions' && f.startsWith(`${fileId}-`),
  );
  if (files.length === 0) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const filename = files[0].slice(fileId.length + 1);
  const filePath = path.join(downloadsDir, files[0]);

  const mimeType = mime.lookup(filename) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
});

export default router;
