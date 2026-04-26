import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import { requireAuth } from './authMiddleware';

const JWT_SECRET = 'test-secret';

describe('requireAuth middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    app = express();
    app.use(cookieParser());
    app.get('/protected', requireAuth, (req, res) => {
      res.json({ user: req.user });
    });
  });

  it('returns 401 when no token cookie is present', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Cookie', 'token=not.a.valid.token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('returns 401 when token is signed with wrong secret', async () => {
    const badToken = jwt.sign({ userId: 1, username: 'alice' }, 'wrong-secret');
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `token=${badToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('returns 401 when token is expired', async () => {
    const expiredToken = jwt.sign(
      { userId: 1, username: 'alice' },
      JWT_SECRET,
      { expiresIn: -1 }
    );
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `token=${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('calls next and attaches user when token is valid', async () => {
    const token = jwt.sign({ userId: 1, username: 'alice' }, JWT_SECRET);
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(1);
    expect(res.body.user.username).toBe('alice');
  });

  it('attaches correct payload fields from token', async () => {
    const token = jwt.sign({ userId: 42, username: 'bob' }, JWT_SECRET);
    const res = await request(app)
      .get('/protected')
      .set('Cookie', `token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe(42);
    expect(res.body.user.username).toBe('bob');
  });
});
