import { Router } from 'express';
import * as todoService from '../services/todoService';
import * as icsService from '../services/icsService';
import { getConversationMeta } from '../storage';

const router = Router();

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
  const todos = await todoService.getTodos(req.params.conversationId);
  res.json({ todos });
});

router.patch('/:conversationId/:todoId', async (req, res) => {
  const allowed = ['status', 'priority', 'dueDate', 'snoozedUntil', 'text'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // If only unknown fields are present, and we allowed them to pass through the above loop
  // but wait, the loop ONLY adds allowed fields.
  // If the user sends { foo: 1 }, updates will be empty, and it returns 400.
  // The requirement says "PATCH ... with unknown field only returns 400"
  // Let's check if the body has fields NOT in allowed.
  const bodyKeys = Object.keys(req.body);
  const hasUnknownOnly = bodyKeys.length > 0 && bodyKeys.every(k => !allowed.includes(k));
  if (hasUnknownOnly) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const updated = await todoService.updateTodo(
      req.params.conversationId,
      req.params.todoId,
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
  try {
    await todoService.deleteTodo(req.params.conversationId, req.params.todoId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message === 'Todo not found') {
      return res.status(404).json({ error: 'Todo not found' });
    }
    throw err;
  }
});

export default router;
