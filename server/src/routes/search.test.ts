import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import searchRouter from './search';
import { SearchService } from '../services/searchService';

vi.mock('../services/searchService', () => ({
  SearchService: {
    search: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (req: any, res: any, next: any) => next(),
}));

describe('Search Route', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/search', searchRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/search returns results', async () => {
    const mockResults = [{ id: '1', title: 'Test', score: 100 }];
    vi.mocked(SearchService.search).mockResolvedValue(mockResults as any);

    const res = await request(app).get('/api/search?q=test');

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('test');
    expect(res.body.results).toEqual(mockResults);
    expect(SearchService.search).toHaveBeenCalledWith('test', expect.objectContaining({
        limit: 20
    }));
  });

  it('GET /api/search returns empty for missing query', async () => {
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(SearchService.search).not.toHaveBeenCalled();
  });
});
