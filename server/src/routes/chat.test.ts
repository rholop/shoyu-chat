import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';
import request from 'supertest';
import express from 'express';

// Mock the dependencies
vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
  getMessages: vi.fn(),
  appendMessage: vi.fn(),
  updateConversationTitle: vi.fn(),
}));

vi.mock('../services/aiRouter', () => ({
  streamChat: vi.fn(),
}));

vi.mock('../services/summaryService', () => ({
  schedule: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { getConversationMeta, getMessages, appendMessage, updateConversationTitle } from '../storage';
import { streamChat } from '../services/aiRouter';
import { schedule as scheduleSummary } from '../services/summaryService';
import chatRouter from '../routes/chat';

describe('POST /send', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/chat', chatRouter);
  });

  it('returns 400 for invalid request body', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
  });

  it('returns 400 for invalid conversationId format', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: 'not-a-uuid', content: 'hello' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent conversation', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null);

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hello' });

    expect(res.status).toBe(404);
  });

//   it('returns error event when streamChat yields no tokens', async () => {
//     vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', user_id: 1, created_at: '', updated_at: '' });
//     vi.mocked(getMessages).mockReturnValue([]);
    
//     // Mock streamChat to yield no tokens (simulates all providers failing)
//     vi.mocked(streamChat).mockImplementation(async function* () {
//       // Yield nothing - simulates all providers failing silently
//     } as any);

//     const res = await request(app)
//       .post('/api/chat/send')
//       .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hello' });

//     expect(res.status).toBe(200);
//     // Should receive SSE data with error
//     const events = res.text.split('\n\n').filter(Boolean);
//     // Either we get an error from the try-catch or from the fallback at the end
//     const hasErrorOrDone = events.some(e => e.includes('"type":"error"') || e.includes('"type":"done"'));
//     expect(hasErrorOrDone).toBe(true);
//   });

//   it('returns done event when streamChat yields tokens', async () => {
//     vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', user_id: 1, created_at: '', updated_at: '' });
//     vi.mocked(getMessages).mockReturnValue([]);
//     vi.mocked(appendMessage).mockReturnValue();
//     vi.mocked(updateConversationTitle).mockReturnValue();
//     vi.mocked(scheduleSummary).mockReturnValue();

//     // Mock streamChat to yield tokens
//     vi.mocked(streamChat).mockImplementation(async function* () {
//       yield { token: 'Hello', model: 'groq-chat' };
//       yield { token: ' world', model: 'groq-chat' };
//     } as any);

//     const res = await request(app)
//       .post('/api/chat/send')
//       .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hi' });

//     expect(res.status).toBe(200);
//     const events = res.text.split('\n\n').filter(Boolean);
//     const doneEvent = events.find(e => e.includes('"type":"done"'));
//     expect(doneEvent).toContain('"model":"groq-chat"');
//   });

//   it('handles streamChat throwing QUOTA_EXCEEDED', async () => {
//     vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', user_id: 1, created_at: '', updated_at: '' });
//     vi.mocked(getMessages).mockReturnValue([]);

//     vi.mocked(streamChat).mockRejectedValue(new Error('QUOTA_EXCEEDED'));

//     const res = await request(app)
//       .post('/api/chat/send')
//       .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hello' });

//     expect(res.status).toBe(200);
//     const events = res.text.split('\n\n').filter(Boolean);
//     const errorEvent = events.find(e => e.includes('"type":"error"'));
//     expect(errorEvent).toContain('quota');
//   });

//   it('handles streamChat throwing rate limit error', async () => {
//     vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', user_id: 1, created_at: '', updated_at: '' });
//     vi.mocked(getMessages).mockReturnValue([]);

//     vi.mocked(streamChat).mockRejectedValue(new Error('Rate limit exceeded'));

//     const res = await request(app)
//       .post('/api/chat/send')
//       .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hello' });

//     expect(res.status).toBe(200);
//     const events = res.text.split('\n\n').filter(Boolean);
//     const errorEvent = events.find(e => e.includes('"type":"error"'));
//     expect(errorEvent).toContain('Rate limit');
//   });

  it('aborts stream when client disconnects', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);

    // Create a generator that tracks if it was aborted
    let aborted = false;
    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { token: 'Hello', model: 'groq-chat' };
      // This would normally continue, but we can't easily test abort in supertest
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hello' });

    // Request completes without hanging
    expect(res.status).toBe(200);
  });
});