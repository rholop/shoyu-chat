import { Router } from 'express';
import { z } from 'zod';
import {
  listConversations,
  getConversationMeta,
  getMessages,
  createConversation,
  updateConversationTitle,
  deleteConversation,
} from '../storage';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listConversations());
});

router.post('/', (_req, res) => {
  const id = createConversation();
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
  // Map to the shape the frontend expects
  const messages = rawMessages.map((m, i) => ({
    id: i,
    conversation_id: id,
    role: m.role,
    content: m.content,
    model_used: m.model ?? null,
    created_at: m.created_at,
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

export default router;
