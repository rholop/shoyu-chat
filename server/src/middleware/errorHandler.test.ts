import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from './errorHandler';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('errorHandler', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.get('/boom', (_req, _res, next) => {
      next(new Error('something exploded'));
    });
    app.use(errorHandler);
  });

  it('returns 500 JSON on error', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('logs the error message', async () => {
    const { logger } = await import('../utils/logger');
    await request(app).get('/boom');
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });
});
