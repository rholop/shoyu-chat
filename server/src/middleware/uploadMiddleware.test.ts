import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function makeApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'));
  process.env.DATA_DIR = tmpDir;
  vi.resetModules();
  const { uploadSingle } = await import('./uploadMiddleware');

  const app = express();
  app.post('/upload', (req, res) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
      res.json({ filename: req.file?.filename ?? null });
    });
  });

  return { app, tmpDir };
}

describe('uploadMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing conversationId', async () => {
    const { app } = await makeApp();
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('hello'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/conversationId/i);
  });

  it('rejects disallowed MIME types', async () => {
    const { app, tmpDir } = await makeApp();
    const convDir = path.join(tmpDir, 'conversations', 'test-conv-id');
    fs.mkdirSync(convDir, { recursive: true });

    const res = await request(app)
      .post('/upload')
      .field('conversationId', 'test-conv-id')
      .attach('file', Buffer.from('exe content'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('accepts allowed MIME types and returns filename', async () => {
    const { app, tmpDir } = await makeApp();
    const convDir = path.join(tmpDir, 'conversations', 'test-conv-id');
    fs.mkdirSync(convDir, { recursive: true });

    const res = await request(app)
      .post('/upload')
      .field('conversationId', 'test-conv-id')
      .attach('file', Buffer.from('hello world'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(200);
    expect(res.body.filename).toMatch(/notes\.txt$/);
  });

  it('rejects files over MAX_FILE_SIZE_MB limit', async () => {
    process.env.MAX_FILE_SIZE_MB = '0';
    const { app, tmpDir } = await makeApp();
    const convDir = path.join(tmpDir, 'conversations', 'test-conv-id');
    fs.mkdirSync(convDir, { recursive: true });

    const res = await request(app)
      .post('/upload')
      .field('conversationId', 'test-conv-id')
      .attach('file', Buffer.from('a'.repeat(100)), {
        filename: 'big.txt',
        contentType: 'text/plain',
      });
    delete process.env.MAX_FILE_SIZE_MB;
    expect(res.status).toBe(400);
  });
});
