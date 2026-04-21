import { Router } from 'express';
import { z } from 'zod';
import {
  getConversations,
  getConversationById,
  getMessages,
  createConversation,
  updateConversationTitle,
  deleteConversation,
} from '../db';

const router = Router();

router.get('/', (req, res) => {
  const conversations = getConversations(req.user!.userId);
  res.json(conversations);
});

router.post('/', (req, res) => {
  const id = createConversation(req.user!.userId);
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversationById(id, req.user!.userId);
  if (!conversation) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const messages = getMessages(id);
  res.json({ ...conversation, messages });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ title: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid title' });
    return;
  }
  const result = updateConversationTitle(id, req.user!.userId, parsed.data.title);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = deleteConversation(id, req.user!.userId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
