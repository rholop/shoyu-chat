import { Router } from 'express';
import crypto from 'crypto';
import * as todoService from '../services/todoService';
import * as icsService from '../services/icsService';
import { getConversationMeta } from '../storage';
import { TodoPriority, TodoStatus, TodoUpdateFields } from '../types';

export function calendarToken(userId: number): string {
  return crypto.createHmac('sha256', process.env.JWT_SECRET!)
    .update(`calendar|${userId}`)
    .digest('hex');
}

export function generateDownloadToken(): { token: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const token = crypto.createHmac('sha256', process.env.JWT_SECRET!)
    .update(`dl|${expires}`)
    .digest('hex');
  return { token, expires };
}

export function verifyDownloadToken(token: string, expires: string | number): boolean {
  const exp = typeof expires === 'string' ? parseInt(expires, 10) : expires;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET!)
    .update(`dl|${exp}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

const router = Router();

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_STATUSES = new Set<TodoStatus>(['open', 'done', 'snoozed']);
const VALID_PRIORITIES = new Set<TodoPriority>(['now', 'soon', 'someday']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const VALID_RECURRENCE_FREQS = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function isSafeId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

router.get('/export.ics', async (req, res) => {
  const todos = await todoService.getAllTodos();
  const openTodos = todos.filter(t => t.status === 'open');

  if (openTodos.length === 0) {
    return res.status(404).json({ error: 'No open todos to export' });
  }

  const todosWithTitle: icsService.TodoWithTitle[] = await Promise.all(
    openTodos.map(async todo => {
      const convId = todo.conversationId.replace(/^conversation-/, '');
      const meta = getConversationMeta(convId);
      return { ...todo, conversationTitle: meta?.title ?? 'Untitled conversation' };
    })
  );

  try {
    const icsContent = icsService.generateIcs(todosWithTitle);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="shoyu-todos.ics"');
    res.send(icsContent);
  } catch (err: any) {
    if (err.message === 'No published todos to export') {
      return res.status(404).json({ error: 'No published todos to export' });
    }
    throw err;
  }
});

router.get('/:conversationId/:todoId/export.ics', async (req, res) => {
  const { conversationId, todoId } = req.params;
  if (!isSafeId(conversationId) || !isSafeId(todoId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const todos = await todoService.getTodos(conversationId);
  const todo = todos.find(t => t.id === todoId);

  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }

  const convId = conversationId.replace(/^conversation-/, '');
  const meta = getConversationMeta(convId);
  const todoWithTitle: icsService.TodoWithTitle = {
    ...todo,
    conversationTitle: meta?.title ?? 'Untitled conversation'
  };

  try {
    const icsContent = icsService.generateIcs([todoWithTitle]);
    const safeName = todo.text.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ics"`);
    res.send(icsContent);
  } catch (err: any) {
    if (err.message === 'No published todos to export') {
      return res.status(404).json({ error: 'No published todos to export' });
    }
    throw err;
  }
});

router.get('/', async (req, res) => {
  const todos = await todoService.getAllTodosWithStatus();
  // Sort: now → soon → someday, then createdAt desc within each group
  const order: Record<string, number> = { now: 0, soon: 1, someday: 2 };
  todos.sort((a, b) => {
    const pd = order[a.priority] - order[b.priority];
    if (pd !== 0) return pd;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  res.json({ todos });
});

router.get('/calendar-token', (req, res) => {
  const token = calendarToken(req.user!.userId);
  res.json({ token });
});

router.get('/download-token', (_req, res) => {
  const { token, expires } = generateDownloadToken();
  res.json({ token, expires });
});

router.get('/conversation/:conversationId', async (req, res) => {
  if (!isSafeId(req.params.conversationId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const todos = await todoService.getTodos(req.params.conversationId);
  res.json({ todos });
});

router.patch('/:conversationId/:todoId', async (req, res) => {
  const { conversationId, todoId } = req.params;
  if (!isSafeId(conversationId) || !isSafeId(todoId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const allowedKeys = ['status', 'priority', 'dueDate', 'snoozedUntil', 'text',
    'startTime', 'endTime', 'location', 'url', 'notes', 'alarms', 'recurrence', 'allDay'] as const;
  const updates: TodoUpdateFields & { snoozedUntil?: string | null } = {};
  for (const key of allowedKeys) {
    if (key in req.body) (updates as any)[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  if ('status' in updates && !VALID_STATUSES.has(updates.status as TodoStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if ('priority' in updates && !VALID_PRIORITIES.has(updates.priority as TodoPriority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }
  if ('dueDate' in updates && updates.dueDate !== null && !DATE_RE.test(updates.dueDate as string)) {
    return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD or null' });
  }
  if ('snoozedUntil' in updates && (updates as any).snoozedUntil !== null && !DATE_RE.test((updates as any).snoozedUntil as string)) {
    return res.status(400).json({ error: 'snoozedUntil must be YYYY-MM-DD or null' });
  }
  if ('startTime' in updates && updates.startTime !== null && !TIME_RE.test(updates.startTime as string)) {
    return res.status(400).json({ error: 'startTime must be HH:MM or null' });
  }
  if ('endTime' in updates && updates.endTime !== null && !TIME_RE.test(updates.endTime as string)) {
    return res.status(400).json({ error: 'endTime must be HH:MM or null' });
  }
  if ('url' in updates && updates.url !== null) {
    try { new URL(updates.url as string); } catch {
      return res.status(400).json({ error: 'url must be a valid URL or null' });
    }
  }
  if ('alarms' in updates && !Array.isArray(updates.alarms)) {
    return res.status(400).json({ error: 'alarms must be an array' });
  }
  if (updates.alarms) {
    for (const alarm of updates.alarms as any[]) {
      if (typeof alarm.trigger !== 'number' || alarm.trigger > 0) {
        return res.status(400).json({ error: 'alarm trigger must be a negative integer (minutes before event)' });
      }
      if (!['DISPLAY', 'EMAIL'].includes(alarm.action)) {
        return res.status(400).json({ error: 'alarm action must be DISPLAY or EMAIL' });
      }
    }
  }
  if ('recurrence' in updates && updates.recurrence !== null && updates.recurrence !== undefined) {
    const rec = updates.recurrence as any;
    if (!VALID_RECURRENCE_FREQS.has(rec.frequency)) {
      return res.status(400).json({ error: 'invalid recurrence frequency' });
    }
    if (typeof rec.interval !== 'number' || rec.interval < 1) {
      return res.status(400).json({ error: 'recurrence interval must be a positive integer' });
    }
  }

  // Strip snoozedUntil from the TodoUpdateFields payload (it's managed separately)
  const { snoozedUntil, ...todoUpdates } = updates as any;
  const finalUpdates: TodoUpdateFields & { snoozedUntil?: string | null } = { ...todoUpdates };
  if ('snoozedUntil' in updates) finalUpdates.snoozedUntil = snoozedUntil;

  try {
    const updated = await todoService.updateTodo(
      conversationId,
      todoId,
      finalUpdates as any
    );
    res.json({ todo: updated });
  } catch (err: any) {
    if (err.message === 'Todo not found') {
      return res.status(404).json({ error: 'Todo not found' });
    }
    throw err;
  }
});

router.delete('/:conversationId/:todoId', async (req, res) => {
  const { conversationId, todoId } = req.params;
  if (!isSafeId(conversationId) || !isSafeId(todoId)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    await todoService.deleteTodo(conversationId, todoId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'Todo not found') {
      return res.status(404).json({ error: 'Todo not found' });
    }
    throw err;
  }
});

export default router;
