import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import todosRouter from './todos';
import * as todoService from '../services/todoService';
import * as storage from '../storage';
import jwt from 'jsonwebtoken';

vi.mock('../services/todoService');
vi.mock('../storage');

const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;

const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock auth middleware
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

app.use('/api/todos', todosRouter);

const authCookie = `token=${jwt.sign({ userId: 1 }, JWT_SECRET)}`;

describe('todos routes', () => {
  describe('GET /api/todos/export.ics', () => {
    it('returns 200 with text/calendar content', async () => {
      const mockTodos = [
        { id: 't1', status: 'open', text: 'Task 1', conversationId: 'conversation-1', priority: 'now' },
      ];
      vi.mocked(todoService.getAllTodos).mockResolvedValue(mockTodos as any);
      vi.mocked(storage.getConversationMeta).mockReturnValue({ title: 'Conv 1' } as any);

      const res = await request(app)
        .get('/api/todos/export.ics')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/calendar');
      expect(res.header['content-disposition']).toContain('attachment; filename="shoyu-todos.ics"');
      expect(res.text).toContain('BEGIN:VCALENDAR');
      expect(res.text).toContain('SUMMARY:Task 1');
      expect(res.text).toContain('DESCRIPTION:Source: "Conv 1"');
    });

    it('returns 404 when no open todos exist', async () => {
      vi.mocked(todoService.getAllTodos).mockResolvedValue([{ status: 'done' }] as any);

      const res = await request(app)
        .get('/api/todos/export.ics')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(404);
    });

    it('requires auth', async () => {
      const res = await request(app).get('/api/todos/export.ics');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/todos/:conversationId/:todoId/export.ics', () => {
    it('returns 200 for a single todo export', async () => {
      const mockTodos = [
        { id: 't1', status: 'open', text: 'Task 1', conversationId: 'conversation-1', priority: 'now' },
      ];
      vi.mocked(todoService.getTodos).mockResolvedValue(mockTodos as any);
      vi.mocked(storage.getConversationMeta).mockReturnValue({ title: 'Conv 1' } as any);

      const res = await request(app)
        .get('/api/todos/conversation-1/t1/export.ics')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/calendar');
      expect(res.header['content-disposition']).toContain('attachment; filename="task-1.ics"');
      expect(res.text).toContain('BEGIN:VCALENDAR');
      expect(res.text).toContain('UID:t1@holop.dev');
    });

    it('returns 404 when todo not found', async () => {
      vi.mocked(todoService.getTodos).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/todos/conversation-1/t-missing/export.ics')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(404);
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/todos', () => {
    it('returns 200 with sorted todos array', async () => {
      const mockTodos = [
        { id: 't1', priority: 'soon', createdAt: '2026-05-01T10:00:00Z' },
        { id: 't2', priority: 'now', createdAt: '2026-05-01T11:00:00Z' },
        { id: 't3', priority: 'now', createdAt: '2026-05-01T12:00:00Z' },
      ];
      vi.mocked(todoService.getAllTodosWithStatus).mockResolvedValue(mockTodos as any);

      const res = await request(app)
        .get('/api/todos')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.todos).toHaveLength(3);
      // Priority order: now, now, soon. For same priority: createdAt desc.
      expect(res.body.todos[0].id).toBe('t3'); // now, 12:00
      expect(res.body.todos[1].id).toBe('t2'); // now, 11:00
      expect(res.body.todos[2].id).toBe('t1'); // soon, 10:00
    });

    it('requires auth', async () => {
      const res = await request(app).get('/api/todos');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/todos/conversation/:id', () => {
    it('returns todos for that conversation only', async () => {
      const mockTodos = [{ id: 't1', text: 'Conv Todo' }];
      vi.mocked(todoService.getTodos).mockResolvedValue(mockTodos as any);

      const res = await request(app)
        .get('/api/todos/conversation/conv-123')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.todos).toEqual(mockTodos);
      expect(todoService.getTodos).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('PATCH /api/todos/:convId/:todoId', () => {
    it('updates todo and returns 200', async () => {
      const updatedTodo = { id: 't1', status: 'done' };
      vi.mocked(todoService.updateTodo).mockResolvedValue(updatedTodo as any);

      const res = await request(app)
        .patch('/api/todos/conv-1/t1')
        .set('Cookie', [authCookie])
        .send({ status: 'done' });

      expect(res.status).toBe(200);
      expect(res.body.todo).toEqual(updatedTodo);
      expect(todoService.updateTodo).toHaveBeenCalledWith('conv-1', 't1', { status: 'done' });
    });

    it('returns 400 with empty body', async () => {
      const res = await request(app)
        .patch('/api/todos/conv-1/t1')
        .set('Cookie', [authCookie])
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 with unknown field only', async () => {
      const res = await request(app)
        .patch('/api/todos/conv-1/t1')
        .set('Cookie', [authCookie])
        .send({ unknownField: 'foo' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when todo not found', async () => {
      vi.mocked(todoService.updateTodo).mockRejectedValue(new Error('Todo not found'));

      const res = await request(app)
        .patch('/api/todos/conv-1/t-missing')
        .set('Cookie', [authCookie])
        .send({ status: 'done' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/todos/:convId/:todoId', () => {
    it('returns 200 on success', async () => {
      vi.mocked(todoService.deleteTodo).mockResolvedValue();

      const res = await request(app)
        .delete('/api/todos/conv-1/t1')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 404 when not found', async () => {
      vi.mocked(todoService.deleteTodo).mockRejectedValue(new Error('Todo not found'));

      const res = await request(app)
        .delete('/api/todos/conv-1/t-missing')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(404);
    });

    it('requires auth', async () => {
      const res = await request(app).delete('/api/todos/conv-1/t1');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/todos/:convId/:todoId — auth', () => {
    it('requires auth', async () => {
      const res = await request(app).patch('/api/todos/conv-1/t1').send({ status: 'done' });
      expect(res.status).toBe(401);
    });
  });
});
