import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Intent } from '../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
  getMessages: vi.fn().mockReturnValue([]),
  appendMessage: vi.fn(),
  updateConversationTitle: vi.fn(),
  conversationFilesDir: vi.fn().mockReturnValue('/tmp/test-conv'),
}));

vi.mock('../services/aiRouter', () => ({
  streamChat: vi.fn(),
}));

vi.mock('../services/summaryService', () => ({
  schedule: vi.fn(),
}));

vi.mock('../services/projectService', () => ({
  getContext: vi.fn().mockReturnValue(''),
}));

vi.mock('../services/fileService', () => ({
  extractContext: vi.fn(),
  formatContextBlock: vi.fn().mockReturnValue(''),
  findConversationFile: vi.fn().mockReturnValue(null),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  getConversationMeta,
  getMessages,
  appendMessage,
  updateConversationTitle,
} from '../storage';
import { streamChat } from '../services/aiRouter';
import { schedule as scheduleSummary } from '../services/summaryService';
import { getContext as getProjectContext } from '../services/projectService';
import chatRouter from '../routes/chat';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONV_ID = '00000000-0000-0000-0000-000000000001';
const CONV_META = { id: CONV_ID, title: 'New Conversation', created_at: '' };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', chatRouter);
  return app;
}

function parseSSEEvents(text: string) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .flatMap((part) => {
      const line = part.replace(/^data: /, '').trim();
      if (!line) return [];
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

async function* makeStream(...tokens: Array<string | { internalNote: string; model: string }>) {
  for (const t of tokens) {
    if (typeof t === 'string') {
      yield { token: t, model: 'gemini' };
    } else {
      yield t;
    }
  }
}

// ── Validation tests ──────────────────────────────────────────────────────────

describe('POST /api/chat/send – request validation', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
  });

  it('returns 400 for missing body', async () => {
    const res = await request(app).post('/api/chat/send').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
  });

  it('returns 400 for non-UUID conversationId', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: 'not-a-uuid', content: 'hello' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid intent value', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello', intent: 'INVALID_INTENT' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when both content and attachments are empty', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('content or attachments');
  });

  it('returns 404 when conversation does not exist', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null);
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });
    expect(res.status).toBe(404);
  });
});

// ── Intent routing tests ──────────────────────────────────────────────────────

describe('POST /api/chat/send – intent routing', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();
  });

  it('defaults to Intent.CODING when intent is omitted', async () => {
    vi.mocked(streamChat).mockImplementation(() => makeStream('hello') as any);

    await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'write a function' });

    expect(streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      Intent.CODING,
      false,
    );
  });

  it('passes WEB_SEARCH intent to streamChat', async () => {
    vi.mocked(streamChat).mockImplementation(() => makeStream('result') as any);

    await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'latest AI news',
      intent: Intent.WEB_SEARCH,
    });

    expect(streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      Intent.WEB_SEARCH,
      false,
    );
  });

  it('passes DEBUGGING intent to streamChat', async () => {
    vi.mocked(streamChat).mockImplementation(() => makeStream('fix') as any);

    await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'TypeError: x is undefined',
      intent: Intent.DEBUGGING,
    });

    expect(streamChat).toHaveBeenCalledWith(
      expect.any(Array),
      Intent.DEBUGGING,
      false,
    );
  });

  it.each([
    Intent.WEB_SEARCH,
    Intent.CODING,
    Intent.DEBUGGING,
    Intent.TRANSLATING,
    Intent.DRAFTING,
    Intent.SUMMARIZING,
    Intent.IMAGE_ANALYSIS,
  ])('accepts intent %s and streams tokens', async (intent) => {
    vi.mocked(streamChat).mockImplementation(() => makeStream('ok') as any);

    const res = await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'test',
      intent,
    });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });
});

// ── SSE streaming tests ───────────────────────────────────────────────────────

describe('POST /api/chat/send – SSE streaming', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();
  });

  it('streams token events then a done event', async () => {
    vi.mocked(streamChat).mockImplementation(
      () => makeStream('Hello', ' world') as any,
    );

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.map((e) => e.content)).toEqual(['Hello', ' world']);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.conversationId).toBe(CONV_ID);
  });

  it('emits an error event when QUOTA_EXCEEDED', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('QUOTA_EXCEEDED');
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.message).toContain('quota');
  });

  it('emits an error event when rate limit is hit', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('Rate limit exceeded');
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent?.message).toContain('Rate limit');
  });

  it('emits no-response error when stream yields no tokens', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      // yield nothing
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    expect(events.some((e) => e.type === 'error' || e.type === 'done')).toBe(true);
  });

  it('persists user and assistant messages after successful stream', async () => {
    vi.mocked(streamChat).mockImplementation(
      () => makeStream('Response') as any,
    );

    await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'User question' });

    expect(appendMessage).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(appendMessage).mock.calls;
    expect(firstCall[1]).toMatchObject({ role: 'user', content: 'User question' });
    expect(secondCall[1]).toMatchObject({ role: 'assistant', content: 'Response' });
  });

  it('updates conversation title from first 60 chars of content', async () => {
    vi.mocked(streamChat).mockImplementation(() => makeStream('ok') as any);

    await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'My question to the AI' });

    expect(updateConversationTitle).toHaveBeenCalledWith(CONV_ID, 'My question to the AI');
  });

  it('does not update title when conversation already has one', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({
      id: CONV_ID,
      title: 'Existing Title',
      created_at: '',
    });
    vi.mocked(streamChat).mockImplementation(() => makeStream('ok') as any);

    await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'follow-up' });

    expect(updateConversationTitle).not.toHaveBeenCalled();
  });

  it('schedules a summary after successful response', async () => {
    vi.mocked(streamChat).mockImplementation(() => makeStream('ok') as any);

    await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(scheduleSummary).toHaveBeenCalledWith(CONV_ID);
  });
});

// ── Internal note relay tests ─────────────────────────────────────────────────

describe('POST /api/chat/send – internal note relay (WEB_SEARCH → DRAFTING)', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();
  });

  it('saves InternalNoteResult as role:internal in ndjson', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { token: 'Here is what I found.', model: 'gemini' };
      yield { internalNote: 'Queries: AI news\nSources:\n- Example: https://example.com', model: 'gemini' };
    } as any);

    const res = await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'latest AI news',
      intent: Intent.WEB_SEARCH,
    });

    expect(res.status).toBe(200);

    // appendMessage should have been called 3 times:
    // 1. internal note, 2. user message, 3. assistant message
    const calls = vi.mocked(appendMessage).mock.calls;
    const internalCall = calls.find((c) => c[1].role === 'internal');
    expect(internalCall).toBeDefined();
    expect(internalCall![1].content).toContain('AI news');
  });

  it('does not emit the internal note as a token SSE event', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { token: 'Answer', model: 'gemini' };
      yield { internalNote: 'Grounding data', model: 'gemini' };
    } as any);

    const res = await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'search query',
      intent: Intent.WEB_SEARCH,
    });

    const events = parseSSEEvents(res.text);
    const tokenEvents = events.filter((e) => e.type === 'token');
    // 'Grounding data' should NOT appear as a token
    expect(tokenEvents.every((e) => e.content !== 'Grounding data')).toBe(true);
    expect(tokenEvents.map((e) => e.content)).toContain('Answer');
  });

  it('injects internal notes from history into system context for subsequent call', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);

    // Simulate stored messages: a previous WEB_SEARCH left an internal note
    vi.mocked(getMessages).mockReturnValue([
      { role: 'user', content: 'search for AI news', created_at: '' },
      { role: 'assistant', content: 'Here is what I found.', model: 'gemini', created_at: '' },
      {
        role: 'internal',
        content: 'Queries: AI news\nSources:\n- Example: https://example.com',
        model: 'gemini',
        created_at: '',
      },
    ] as any);

    let capturedMessages: unknown[] = [];
    vi.mocked(streamChat).mockImplementation(async function* (msgs) {
      capturedMessages = msgs;
      yield { token: 'Draft with search context', model: 'groq-chat' };
    } as any);

    await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'now write a blog post about it',
      intent: Intent.DRAFTING,
    });

    // The system message should contain the research notes
    const systemMsg = capturedMessages.find(
      (m: any) => m.role === 'system',
    ) as { role: string; content: string } | undefined;

    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toContain('Research Notes');
    expect(systemMsg?.content).toContain('AI news');
    expect(systemMsg?.content).toContain('https://example.com');
  });

  it('filters internal messages out of conversation history passed to specialist', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);

    vi.mocked(getMessages).mockReturnValue([
      { role: 'user', content: 'user message', created_at: '' },
      { role: 'internal', content: 'internal research notes', created_at: '' },
      { role: 'assistant', content: 'assistant reply', model: 'gemini', created_at: '' },
    ] as any);

    let capturedMessages: unknown[] = [];
    vi.mocked(streamChat).mockImplementation(async function* (msgs) {
      capturedMessages = msgs;
      yield { token: 'ok', model: 'groq-chat' };
    } as any);

    await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'next question',
      intent: Intent.DRAFTING,
    });

    const nonSystemMsgs = capturedMessages.filter((m: any) => m.role !== 'system');
    // internal role should NOT appear in the history passed to streamChat
    expect(nonSystemMsgs.every((m: any) => m.role !== 'internal')).toBe(true);
    // but user and assistant should be present
    expect(nonSystemMsgs.some((m: any) => m.role === 'user')).toBe(true);
    expect(nonSystemMsgs.some((m: any) => m.role === 'assistant')).toBe(true);
  });
});

// ── Project context injection ─────────────────────────────────────────────────

describe('POST /api/chat/send – project context injection', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(updateConversationTitle).mockReturnValue(true);
    vi.mocked(scheduleSummary).mockReturnValue();
  });

  it('injects project context as system message when projectId is set', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({
      id: CONV_ID,
      title: 'Chat',
      created_at: '',
      projectId: 'proj-123',
    } as any);
    vi.mocked(getProjectContext).mockReturnValue('Use TypeScript and follow SOLID principles.');

    let capturedMsgs: unknown[] = [];
    vi.mocked(streamChat).mockImplementation(async function* (msgs) {
      capturedMsgs = msgs;
      yield { token: 'ok', model: 'nvidia' };
    } as any);

    await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'write a class',
    });

    const systemMsg = capturedMsgs.find((m: any) => m.role === 'system') as
      | { role: string; content: string }
      | undefined;
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.content).toContain('Project Context');
    expect(systemMsg?.content).toContain('SOLID principles');
  });

  it('does not add system message when project context is empty', async () => {
    vi.mocked(getConversationMeta).mockReturnValue({
      id: CONV_ID,
      title: 'Chat',
      created_at: '',
      projectId: 'proj-empty',
    } as any);
    vi.mocked(getProjectContext).mockReturnValue('  ');

    let capturedMsgs: unknown[] = [];
    vi.mocked(streamChat).mockImplementation(async function* (msgs) {
      capturedMsgs = msgs;
      yield { token: 'ok', model: 'nvidia' };
    } as any);

    await request(app).post('/api/chat/send').send({
      conversationId: CONV_ID,
      content: 'hello',
    });

    expect(capturedMsgs.some((m: any) => m.role === 'system')).toBe(false);
  });
});
