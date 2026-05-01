import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../middleware/uploadMiddleware', () => ({
  uploadSingle: vi.fn((req: express.Request, _res: express.Response, cb: (err?: Error) => void) => {
    (req as express.Request & { file?: Record<string, unknown> }).file = {
      filename: 'abc123-notes.txt',
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      size: 100,
      path: '/tmp/abc123-notes.txt',
    };
    cb();
  }),
}));

vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
}));

vi.mock('../services/fileService', () => ({
  findConversationFile: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getConversationMeta } from '../storage';
import { findConversationFile } from '../services/fileService';
import filesRouter from './files';

const CONV_ID = '11111111-1111-1111-1111-111111111111';
const FILE_ID = '22222222-2222-2222-2222-222222222222';

describe('files routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/', filesRouter);
  });

  describe('POST /upload', () => {
    it('returns 404 when conversation not found', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(null);
      // uploadSingle is mocked so we can post JSON to populate req.body
      const res = await request(app)
        .post('/upload')
        .send({ conversationId: CONV_ID });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 201 with file metadata on success', async () => {
      vi.mocked(getConversationMeta).mockReturnValue({
        id: CONV_ID, title: 'Test', created_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/upload')
        .send({ conversationId: CONV_ID });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 100,
      });
      expect(typeof res.body.fileId).toBe('string');
    });

    it('returns 400 when uploadSingle calls back with an error', async () => {
      const { uploadSingle } = await import('../middleware/uploadMiddleware');
      vi.mocked(uploadSingle).mockImplementationOnce(
        (_req, _res, cb) => cb(new Error('File type not allowed')),
      );

      const res = await request(app)
        .post('/upload')
        .send({ conversationId: CONV_ID });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not allowed/i);
    });
  });

  describe('GET /:conversationId/:fileId', () => {
    it('returns 400 for non-UUID params', async () => {
      const res = await request(app).get('/not-a-uuid/also-not');
      expect(res.status).toBe(400);
    });

    it('returns 404 when file not found', async () => {
      vi.mocked(findConversationFile).mockReturnValue(null);
      const res = await request(app).get(`/${CONV_ID}/${FILE_ID}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:conversationId/:fileId', () => {
    it('returns 400 for non-UUID params', async () => {
      const res = await request(app).delete('/bad/params');
      expect(res.status).toBe(400);
    });

    it('returns 404 when file not found', async () => {
      vi.mocked(findConversationFile).mockReturnValue(null);
      const res = await request(app).delete(`/${CONV_ID}/${FILE_ID}`);
      expect(res.status).toBe(404);
    });
  });
});
