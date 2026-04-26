import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../storage', () => ({
  listConversations: vi.fn(),
  getConversationMeta: vi.fn(),
  getMessages: vi.fn(),
  createConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import {
  listConversations,
  getConversationMeta,
  getMessages,
  createConversation,
  updateConversationTitle,
  deleteConversation,
} from '../storage';
import conversationsRouter from './conversations';

describe('Conversations routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationsRouter);
  });

  describe('GET /', () => {
    it('returns list of conversations', async () => {
      const convos = [
        { id: 'abc', title: 'First', created_at: '2026-01-01' },
        { id: 'def', title: 'Second', created_at: '2026-01-02' },
      ];
      vi.mocked(listConversations).mockReturnValue(convos);

      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(convos);
    });

    it('returns empty array when no conversations exist', async () => {
      vi.mocked(listConversations).mockReturnValue([]);

      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /', () => {
    it('creates a new conversation and returns its id', async () => {
      vi.mocked(createConversation).mockReturnValue('new-id-123');

      const res = await request(app).post('/api/conversations');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'new-id-123' });
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when conversation does not exist', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(null);

      const res = await request(app).get('/api/conversations/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('returns conversation with messages', async () => {
      vi.mocked(getConversationMeta).mockReturnValue({
        id: 'abc',
        title: 'Test Chat',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      vi.mocked(getMessages).mockReturnValue([
        { role: 'user', content: 'Hello', created_at: '2026-01-01T00:01:00.000Z' },
        { role: 'assistant', content: 'Hi there', model: 'groq-chat', created_at: '2026-01-01T00:02:00.000Z' },
      ]);

      const res = await request(app).get('/api/conversations/abc');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('abc');
      expect(res.body.title).toBe('Test Chat');
      expect(res.body.messages).toHaveLength(2);
    });

    it('maps messages with index-based ids and conversation_id', async () => {
      vi.mocked(getConversationMeta).mockReturnValue({
        id: 'abc',
        title: 'Test',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      vi.mocked(getMessages).mockReturnValue([
        { role: 'user', content: 'Hello', created_at: '2026-01-01T00:01:00.000Z' },
      ]);

      const res = await request(app).get('/api/conversations/abc');
      expect(res.status).toBe(200);
      expect(res.body.messages[0].id).toBe(0);
      expect(res.body.messages[0].conversation_id).toBe('abc');
      expect(res.body.messages[0].role).toBe('user');
      expect(res.body.messages[0].content).toBe('Hello');
    });

    it('maps model to model_used, null when absent', async () => {
      vi.mocked(getConversationMeta).mockReturnValue({
        id: 'abc',
        title: 'Test',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      vi.mocked(getMessages).mockReturnValue([
        { role: 'user', content: 'Hello', created_at: '2026-01-01T00:01:00.000Z' },
        { role: 'assistant', content: 'Hi', model: 'groq-chat', created_at: '2026-01-01T00:02:00.000Z' },
      ]);

      const res = await request(app).get('/api/conversations/abc');
      expect(res.body.messages[0].model_used).toBeNull();
      expect(res.body.messages[1].model_used).toBe('groq-chat');
    });
  });

  describe('PATCH /:id', () => {
    it('returns 400 when title is missing', async () => {
      const res = await request(app).patch('/api/conversations/abc').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid title');
    });

    it('returns 400 when title is empty string', async () => {
      const res = await request(app).patch('/api/conversations/abc').send({ title: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when title exceeds 200 characters', async () => {
      const res = await request(app)
        .patch('/api/conversations/abc')
        .send({ title: 'a'.repeat(201) });
      expect(res.status).toBe(400);
    });

    it('returns 404 when conversation does not exist', async () => {
      vi.mocked(updateConversationTitle).mockReturnValue(false);

      const res = await request(app)
        .patch('/api/conversations/nonexistent')
        .send({ title: 'New Title' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('updates title successfully', async () => {
      vi.mocked(updateConversationTitle).mockReturnValue(true);

      const res = await request(app)
        .patch('/api/conversations/abc')
        .send({ title: 'Updated Title' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(updateConversationTitle).toHaveBeenCalledWith('abc', 'Updated Title');
    });

    it('accepts title of exactly 200 characters', async () => {
      vi.mocked(updateConversationTitle).mockReturnValue(true);

      const res = await request(app)
        .patch('/api/conversations/abc')
        .send({ title: 'a'.repeat(200) });
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /:id', () => {
    it('returns 404 when conversation does not exist', async () => {
      vi.mocked(deleteConversation).mockReturnValue(false);

      const res = await request(app).delete('/api/conversations/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('deletes conversation successfully', async () => {
      vi.mocked(deleteConversation).mockReturnValue(true);

      const res = await request(app).delete('/api/conversations/abc');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(deleteConversation).toHaveBeenCalledWith('abc');
    });
  });
});
