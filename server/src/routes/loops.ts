import { Router } from 'express';
import * as insightsService from '../services/insightsService';
import * as todoService from '../services/todoService';

const router = Router();

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
function isSafeId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

router.get('/', async (req, res) => {
  let loops = await insightsService.getUnresolvedThreads();

  if (req.query.projectId) {
    loops = loops.filter(l => l.projectId === req.query.projectId);
  }
  if (req.query.intent) {
    loops = loops.filter(l => l.intent === req.query.intent);
  }
  if (req.query.age) {
    const minAge = parseInt(req.query.age as string, 10);
    if (!isNaN(minAge)) {
      loops = loops.filter(l => l.daysSinceCreated >= minAge);
    }
  }

  res.json({ loops, total: loops.length });
});

router.post('/:conversationId/snooze', async (req, res) => {
  if (!isSafeId(req.params.conversationId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const { snoozedUntil } = req.body;
  if (!snoozedUntil || !/^\d{4}-\d{2}-\d{2}$/.test(snoozedUntil)) {
    return res.status(400).json({ error: 'snoozedUntil must be YYYY-MM-DD' });
  }
  try {
    await insightsService.snoozeLoop(req.params.conversationId, snoozedUntil);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post('/:conversationId/resolve', async (req, res) => {
  if (!isSafeId(req.params.conversationId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    await insightsService.resolveLoop(req.params.conversationId);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.post('/:conversationId/todo', async (req, res) => {
  if (!isSafeId(req.params.conversationId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const loops = await insightsService.getUnresolvedThreads();
  const loop = loops.find(l => l.conversationId === req.params.conversationId);
  if (!loop) {
    return res.status(404).json({ error: 'Loop not found' });
  }
  const todo = await todoService.createTodoFromLoop(loop);
  res.json({ todo });
});

export default router;
