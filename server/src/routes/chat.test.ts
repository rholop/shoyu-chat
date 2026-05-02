import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
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

  // ── Validation ───────────────────────────────────────────────────────────────

  it('returns 400 for missing body fields', async () => {
    const res = await request(app).post('/api/chat/send').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
  });

  it('returns 400 for invalid conversationId format', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: 'not-a-uuid', content: 'hello' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unrecognized intent value', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    const res = await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'hello',
      intent: 'INVALID_INTENT',
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent conversation', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null);
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hello' });
    expect(res.status).toBe(404);
  });

  // ── Token streaming ──────────────────────────────────────────────────────────

  it('streams token events and sends done when stream completes', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'New Conversation',
      created_at: '',
    });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { type: 'token', token: 'Hello', model: 'groq-chat' };
      yield { type: 'token', token: ' world', model: 'groq-chat' };
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: '00000000-0000-0000-0000-000000000001', content: 'hi' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('"type":"token"');
    expect(res.text).toContain('"type":"done"');
    expect(res.text).toContain('"model":"groq-chat"');
  });

  it('accepts and passes a valid intent to streamChat', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { type: 'token', token: 'Searching...', model: 'gemini' };
    } as any);

    await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'What is the latest React version?',
      intent: 'WEB_SEARCH',
    });

    expect(streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      'WEB_SEARCH'
    );
  });

  // ── Internal message handling ────────────────────────────────────────────────

  it('stores internal messages in storage without streaming them to the client', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { type: 'token', token: 'Search result summary.', model: 'gemini' };
      yield { type: 'internal', content: '## Web Search Context\n- [source](https://example.com)', model: 'gemini' };
    } as any);

    const res = await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'search query',
      intent: 'WEB_SEARCH',
    });

    // SSE stream must NOT contain the internal content
    expect(res.text).not.toContain('Web Search Context');
    expect(res.text).not.toContain('example.com');

    // appendMessage called for: internal, user, assistant (in that order)
    const calls = vi.mocked(appendMessage).mock.calls;
    expect(calls.length).toBe(3);
    expect(calls[0][1].role).toBe('internal');
    expect(calls[0][1].content).toContain('Web Search Context');
    expect(calls[1][1].role).toBe('user');
    expect(calls[2][1].role).toBe('assistant');
  });

  it('does NOT stream internal messages — they are hidden from client', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(scheduleSummary).mockReturnValue();

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { type: 'token', token: 'answer', model: 'gemini' };
      yield { type: 'internal', content: 'SECRET_INTERNAL_DATA', model: 'gemini' };
    } as any);

    const res = await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'query',
    });

    expect(res.text).not.toContain('SECRET_INTERNAL_DATA');
  });

  // ── Internal messages in history ─────────────────────────────────────────────

  it('maps stored internal messages to user-role context for AI', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([
      { role: 'internal', content: '## Web Search Context\n- [src](https://x.com)', created_at: '' },
      { role: 'user', content: 'What did the search say?', created_at: '' },
      { role: 'assistant', content: 'Here is the info.', model: 'gemini', created_at: '' },
    ] as any);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(scheduleSummary).mockReturnValue();

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { type: 'token', token: 'ok', model: 'groq-chat' };
    } as any);

    await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'follow-up',
    });

    const contextPassed = vi.mocked(streamChat).mock.calls[0][0];
    const internalMapped = contextPassed.find((m: any) => m.content.includes('Search Context'));
    expect(internalMapped).toBeDefined();
    expect(internalMapped?.role).toBe('user');
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('sends QUOTA_EXCEEDED error via SSE', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(streamChat).mockRejectedValue(new Error('QUOTA_EXCEEDED'));

    const res = await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'hello',
    });

    expect(res.status).toBe(200);
    const errorEvent = res.text.split('\n\n').find((e) => e.includes('"type":"error"'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('quota');
  });

  it('sends rate limit error message via SSE', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(streamChat).mockRejectedValue(new Error('Rate limit exceeded'));

    const res = await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'hello',
    });

    expect(res.status).toBe(200);
    const errorEvent = res.text.split('\n\n').find((e) => e.includes('"type":"error"'));
    expect(errorEvent).toContain('Rate limit');
  });

  it('sends error when stream yields no tokens', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({ id: '1', title: 'Test', created_at: '' });
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(streamChat).mockImplementation(async function* () {
      // yields nothing
    } as any);

    const res = await request(app).post('/api/chat/send').send({
      conversationId: '00000000-0000-0000-0000-000000000001',
      content: 'hello',
    });

    expect(res.status).toBe(200);
    const events = res.text.split('\n\n').filter(Boolean);
    const hasErrorOrDone = events.some(
      (e) => e.includes('"type":"error"') || e.includes('"type":"done"')
    );
    expect(hasErrorOrDone).toBe(true);
  });
});
