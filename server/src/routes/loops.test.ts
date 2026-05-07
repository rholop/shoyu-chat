import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import loopsRouter from './loops';
import * as insightsService from '../services/insightsService';
import * as todoService from '../services/todoService';

vi.mock('../services/insightsService', () => ({
  getUnresolvedThreads: vi.fn(),
  snoozeLoop: vi.fn(),
  resolveLoop: vi.fn(),
}));
vi.mock('../services/todoService', () => ({
  createTodoFromLoop: vi.fn(),
}));

const JWT_SECRET = 'test-loops-secret';
process.env.JWT_SECRET = JWT_SECRET;
const authCookie = `token=${jwt.sign({ userId: 1 }, JWT_SECRET)}`;

function makeApp(withAuth = false) {
  const a = express();
  a.use(express.json());
  a.use(cookieParser());
  if (withAuth) {
    a.use((req, res, next) => {
      const token = req.cookies.token;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      try { jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Unauthorized' }); }
    });
  }
  a.use('/api/loops', loopsRouter);
  return a;
}

describe('Loops Routes', () => {
  const app = makeApp();
  const authApp = makeApp(true);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/loops', () => {
    it('returns loops array and total count', async () => {
      const mockLoops = [
        { conversationId: '1', title: 'Loop 1', daysSinceCreated: 5, intent: 'CODING', projectId: 'p1' }
      ];
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue(mockLoops as any);

      const res = await request(app).get('/api/loops');
      expect(res.status).toBe(200);
      expect(res.body.loops).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('filters by projectId', async () => {
      const mockLoops = [
        { conversationId: '1', projectId: 'p1' },
        { conversationId: '2', projectId: 'p2' }
      ];
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue(mockLoops as any);

      const res = await request(app).get('/api/loops?projectId=p1');
      expect(res.body.loops).toHaveLength(1);
      expect(res.body.loops[0].conversationId).toBe('1');
    });

    it('filters by intent', async () => {
      const mockLoops = [
        { conversationId: '1', intent: 'CODING' },
        { conversationId: '2', intent: 'DEBUGGING' }
      ];
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue(mockLoops as any);

      const res = await request(app).get('/api/loops?intent=DEBUGGING');
      expect(res.body.loops).toHaveLength(1);
      expect(res.body.loops[0].conversationId).toBe('2');
    });

    it('filters by age', async () => {
      const mockLoops = [
        { conversationId: '1', daysSinceCreated: 5 },
        { conversationId: '2', daysSinceCreated: 10 }
      ];
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue(mockLoops as any);

      const res = await request(app).get('/api/loops?age=7');
      expect(res.body.loops).toHaveLength(1);
      expect(res.body.loops[0].conversationId).toBe('2');
    });
  });

  describe('POST /api/loops/:id/snooze', () => {
    it('returns 200 for valid YYYY-MM-DD', async () => {
      vi.mocked(insightsService.snoozeLoop).mockResolvedValue(undefined);
      const res = await request(app)
        .post('/api/loops/1/snooze')
        .send({ snoozedUntil: '2024-02-01' });
      expect(res.status).toBe(200);
      expect(insightsService.snoozeLoop).toHaveBeenCalledWith('1', '2024-02-01');
    });

    it('returns 400 for invalid date format', async () => {
      const res = await request(app)
        .post('/api/loops/1/snooze')
        .send({ snoozedUntil: 'tomorrow' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/loops/:id/resolve', () => {
    it('returns 200', async () => {
      vi.mocked(insightsService.resolveLoop).mockResolvedValue(undefined);
      const res = await request(app).post('/api/loops/1/resolve');
      expect(res.status).toBe(200);
      expect(insightsService.resolveLoop).toHaveBeenCalledWith('1');
    });
  });

  describe('POST /api/loops/:id/todo', () => {
    it('returns todo object', async () => {
      const mockLoops = [{ conversationId: '1' }];
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue(mockLoops as any);
      vi.mocked(todoService.createTodoFromLoop).mockResolvedValue({ id: 'todo-1' } as any);

      const res = await request(app).post('/api/loops/1/todo');
      expect(res.status).toBe(200);
      expect(res.body.todo.id).toBe('todo-1');
    });

    it('returns 404 when loop not found', async () => {
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue([]);
      const res = await request(app).post('/api/loops/1/todo');
      expect(res.status).toBe(404);
    });
  });

  describe('auth enforcement', () => {
    it('GET / returns 401 without token', async () => {
      const res = await request(authApp).get('/api/loops');
      expect(res.status).toBe(401);
    });

    it('GET / returns 200 with valid token', async () => {
      vi.mocked(insightsService.getUnresolvedThreads).mockResolvedValue([]);
      const res = await request(authApp).get('/api/loops').set('Cookie', [authCookie]);
      expect(res.status).toBe(200);
    });

    it('POST /1/snooze returns 401 without token', async () => {
      const res = await request(authApp).post('/api/loops/1/snooze').send({ snoozedUntil: '2026-06-01' });
      expect(res.status).toBe(401);
    });

    it('POST /1/resolve returns 401 without token', async () => {
      const res = await request(authApp).post('/api/loops/1/resolve');
      expect(res.status).toBe(401);
    });

    it('POST /1/todo returns 401 without token', async () => {
      const res = await request(authApp).post('/api/loops/1/todo');
      expect(res.status).toBe(401);
    });
  });
});
