import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';

vi.mock('../storage', () => ({
  readUser: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-token'),
    verify: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { readUser } from '../storage';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authRouter from './auth';

describe('Auth routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
  });

  describe('POST /login', () => {
    it('returns 400 when body is missing', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request');
    });

    it('returns 400 when username is missing', async () => {
      const res = await request(app).post('/api/auth/login').send({ password: 'pass' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
      const res = await request(app).post('/api/auth/login').send({ username: 'user' });
      expect(res.status).toBe(400);
    });

    it('returns 401 when user does not exist', async () => {
      vi.mocked(readUser).mockReturnValue(null);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'pass' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 401 when username does not match', async () => {
      vi.mocked(readUser).mockReturnValue({
        username: 'alice',
        password_hash: '$2b$10$hash',
        email: 'alice@example.com',
        created_at: '2026-01-01',
      });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'bob', password: 'pass' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns 401 when password is wrong', async () => {
      vi.mocked(readUser).mockReturnValue({
        username: 'alice',
        password_hash: '$2b$10$hash',
        email: 'alice@example.com',
        created_at: '2026-01-01',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'wrongpass' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('returns user info and sets cookie on successful login', async () => {
      vi.mocked(readUser).mockReturnValue({
        username: 'alice',
        password_hash: '$2b$10$hash',
        email: 'alice@example.com',
        created_at: '2026-01-01',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(jwt.sign).mockReturnValue('signed-token' as never);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'correctpass' });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('alice');
      expect(res.body.email).toBe('alice@example.com');
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie'][0]).toContain('token=signed-token');
    });

    it('signs JWT with correct payload', async () => {
      vi.mocked(readUser).mockReturnValue({
        username: 'alice',
        password_hash: '$2b$10$hash',
        email: 'alice@example.com',
        created_at: '2026-01-01',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'correctpass' });

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 1, username: 'alice' },
        'test-secret',
        { expiresIn: '7d' }
      );
    });
  });

  describe('POST /logout', () => {
    it('clears the token cookie', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Cookie should be cleared (set with empty value or expires in the past)
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      if (cookies) {
        expect(cookies[0]).toContain('token=');
      }
    });
  });

  describe('GET /me', () => {
    it('returns user info when authenticated', async () => {
      vi.mocked(readUser).mockReturnValue({
        username: 'alice',
        password_hash: '$2b$10$hash',
        email: 'alice@example.com',
        created_at: '2026-01-01',
      });

      // requireAuth is bypassed by mock, but req.user won't be set
      // We need to add a middleware to set req.user for this test
      const testApp = express();
      testApp.use(express.json());
      testApp.use(cookieParser());
      testApp.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
        req.user = { userId: 1, username: 'alice' };
        next();
      });
      testApp.use('/api/auth', authRouter);

      const res = await request(testApp).get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(1);
      expect(res.body.username).toBe('alice');
      expect(res.body.email).toBe('alice@example.com');
    });

    it('returns empty email when user file is missing', async () => {
      vi.mocked(readUser).mockReturnValue(null);

      const testApp = express();
      testApp.use(express.json());
      testApp.use(cookieParser());
      testApp.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
        req.user = { userId: 1, username: 'ghost' };
        next();
      });
      testApp.use('/api/auth', authRouter);

      const res = await request(testApp).get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('');
    });
  });
});
