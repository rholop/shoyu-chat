import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import insightsRouter from './insights';
import * as insightsService from '../services/insightsService';

vi.mock('../services/insightsService');
vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (req: any, res: any, next: any) => next(),
}));

describe('insights router', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', insightsRouter);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/insights/similar', () => {
    it('returns 400 if message or conversationId is missing', async () => {
      const res = await request(app).post('/api/insights/similar').send({ message: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns matches from insightsService', async () => {
      const mockMatches = [
        {
          conversationId: 'c1',
          title: 'Title 1',
          goal: 'Goal 1',
          date: '2024-01-01',
          resolved: false,
          score: 0.5,
          topics: ['t1'],
        },
      ];
      vi.mocked(insightsService.findSimilar).mockResolvedValue(mockMatches);

      const res = await request(app)
        .post('/api/insights/similar')
        .send({ message: 'some message', conversationId: 'curr' });

      expect(res.status).toBe(200);
      expect(res.body.matches).toEqual(mockMatches);
      expect(insightsService.findSimilar).toHaveBeenCalledWith('some message', 'curr');
    });

    it('returns 200 with empty matches when no results', async () => {
      vi.mocked(insightsService.findSimilar).mockResolvedValue([]);
      const res = await request(app)
        .post('/api/insights/similar')
        .send({ message: 'no match', conversationId: 'curr' });

      expect(res.status).toBe(200);
      expect(res.body.matches).toEqual([]);
    });

    it('returns 500 on service error', async () => {
      vi.mocked(insightsService.findSimilar).mockRejectedValue(new Error('fail'));
      const res = await request(app)
        .post('/api/insights/similar')
        .send({ message: 'test', conversationId: 'curr' });

      expect(res.status).toBe(500);
    });
  });
});
