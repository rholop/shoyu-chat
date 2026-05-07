import { Router } from 'express';
import * as todoService from '../services/todoService';
import * as icsService from '../services/icsService';
import { getConversationMeta } from '../storage';
import { TodoPriority, TodoStatus } from '../types';

const router = Router();

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const VALID_STATUSES = new Set<TodoStatus>(['open', 'done', 'snoozed']);
const VALID_PRIORITIES = new Set<TodoPriority>(['now', 'soon', 'someday']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isSafeId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

router.get('/export.ics', async (req, res) => {
  const todos = await todoService.getAllTodos();
  const openTodos = todos.filter(t => t.status === 'open');

  if (openTodos.length === 0) {
    return res.status(404).json({ error: 'No open todos to export' });
  }

  // Enrich todos with conversation title
  const todosWithTitle: icsService.TodoWithTitle[] = await Promise.all(
    openTodos.map(async todo => {
      const convId = todo.conversationId.replace(/^conversation-/, '');
      const meta = getConversationMeta(convId);
      return { ...todo, conversationTitle: meta?.title ?? 'Untitled conversation' };
    })
  );

  const icsContent = icsService.generateIcs(todosWithTitle);

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="shoyu-todos.ics"');
  res.send(icsContent);
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

  const icsContent = icsService.generateIcs([todoWithTitle]);
  const safeName = todo.text.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ics"`);
  res.send(icsContent);
});

router.get('/', async (req, res) => {
  const todos = await todoService.getAllTodos();
  // Sort: now → soon → someday, then createdAt desc within each group
  const order: Record<string, number> = { now: 0, soon: 1, someday: 2 };
  todos.sort((a, b) => {
    const pd = order[a.priority] - order[b.priority];
    if (pd !== 0) return pd;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  res.json({ todos });
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

  const allowed = ['status', 'priority', 'dueDate', 'snoozedUntil', 'text'] as const;
  const updates: Partial<Pick<import('../types').Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // Validate enum/format fields when provided
  if ('status' in updates && !VALID_STATUSES.has(updates.status as TodoStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if ('priority' in updates && !VALID_PRIORITIES.has(updates.priority as TodoPriority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }
  if ('dueDate' in updates && updates.dueDate !== null && !DATE_RE.test(updates.dueDate as string)) {
    return res.status(400).json({ error: 'dueDate must be YYYY-MM-DD or null' });
  }
  if ('snoozedUntil' in updates && updates.snoozedUntil !== null && !DATE_RE.test(updates.snoozedUntil as string)) {
    return res.status(400).json({ error: 'snoozedUntil must be YYYY-MM-DD or null' });
  }

  try {
    const updated = await todoService.updateTodo(
      conversationId,
      todoId,
      updates
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
