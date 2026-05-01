/**
 * E2E integration tests: client → server (HTTP + SSE)
 *
 * These tests spin up the full Express app with mocked AI providers and storage
 * to verify the complete request/response lifecycle, including auth, SSE framing,
 * intent routing, and the WEB_SEARCH → DRAFTING relay pattern.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Intent } from '../types';

// ── External mocks ─────────────────────────────────────────────────────────

vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
  getMessages: vi.fn().mockReturnValue([]),
  appendMessage: vi.fn(),
  updateConversationTitle: vi.fn().mockReturnValue(true),
  conversationFilesDir: vi.fn().mockReturnValue('/tmp/e2e-conv'),
  readUser: vi.fn(),
  getUsageCount: vi.fn().mockReturnValue(0),
  incrementUsage: vi.fn(),
}));

vi.mock('../services/aiRouter', () => ({
  streamChat: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock('../services/summaryService', () => ({
  schedule: vi.fn(),
  recoverSummaryTimers: vi.fn(),
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

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getConversationMeta, getMessages, appendMessage, readUser } from '../storage';
import { streamChat } from '../services/aiRouter';
import chatRouter from './chat';
import authRouter from './auth';

// ── App factory ───────────────────────────────────────────────────────────────

const JWT_SECRET = 'e2e-test-secret';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Auth routes (for login/me endpoint testing)
  app.use('/api/auth', authRouter);

  // Chat routes with real auth middleware
  const requireAuth = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const token = req.cookies?.token;
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      (req as any).user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };

  app.use('/api/chat', requireAuth, chatRouter);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONV_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CONV_META = { id: CONV_ID, title: 'New Conversation', created_at: '' };

function makeAuthCookie(app: express.Application): Promise<string> {
  return Promise.resolve(
    `token=${jwt.sign({ userId: 1, username: 'test' }, JWT_SECRET)}`,
  );
}

function parseSSEEvents(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter(Boolean)
    .flatMap((part) => {
      const line = part.replace(/^data: /, '').trim();
      if (!line) return [];
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

async function* makeTokenStream(
  ...items: Array<{ token: string; model: string } | { internalNote: string; model: string }>
) {
  for (const item of items) yield item;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('E2E: Authentication guard', () => {
  let app: express.Application;

  beforeAll(() => { app = buildApp(); });

  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when no auth cookie is provided', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .send({ conversationId: CONV_ID, content: 'hello' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when auth cookie contains an invalid token', async () => {
    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', 'token=invalid.jwt.token')
      .send({ conversationId: CONV_ID, content: 'hello' });
    expect(res.status).toBe(401);
  });

  it('proceeds past auth with a valid JWT cookie', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null); // 404 after auth
    const cookie = await makeAuthCookie(app);
    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });
    expect(res.status).toBe(404); // auth passed, conversation not found
  });
});

describe('E2E: Full streaming lifecycle', () => {
  let app: express.Application;
  let cookie: string;

  beforeAll(async () => {
    app = buildApp();
    cookie = await makeAuthCookie(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
  });

  it('returns SSE content-type header', async () => {
    vi.mocked(streamChat).mockImplementation(
      () => makeTokenStream({ token: 'hi', model: 'nvidia' }) as any,
    );

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
  });

  it('streams warmup comment then token events then done event', async () => {
    vi.mocked(streamChat).mockImplementation(
      () => makeTokenStream(
        { token: 'Hello', model: 'nvidia' },
        { token: ' world', model: 'nvidia' },
      ) as any,
    );

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.text).toContain(': warmup');
    const events = parseSSEEvents(res.text);
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.map((e) => e.content)).toEqual(['Hello', ' world']);
    const done = events.find((e) => e.type === 'done');
    expect(done?.conversationId).toBe(CONV_ID);
    expect(done?.model).toBe('nvidia');
  });

  it('persists messages and emits done', async () => {
    vi.mocked(streamChat).mockImplementation(
      () => makeTokenStream({ token: 'Answer here', model: 'groq-chat' }) as any,
    );

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'User question', intent: Intent.DEBUGGING });

    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(appendMessage).mock.calls;
    expect(calls[0][1]).toMatchObject({ role: 'user', content: 'User question' });
    expect(calls[1][1]).toMatchObject({ role: 'assistant', content: 'Answer here', model: 'groq-chat' });
  });

  it('emits error SSE event on QUOTA_EXCEEDED and does not persist messages', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('QUOTA_EXCEEDED');
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'test' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    const err = events.find((e) => e.type === 'error');
    expect(err?.message).toMatch(/quota/i);
    expect(appendMessage).not.toHaveBeenCalled();
  });
});

describe('E2E: WEB_SEARCH → DRAFTING relay', () => {
  let app: express.Application;
  let cookie: string;

  beforeAll(async () => {
    app = buildApp();
    cookie = await makeAuthCookie(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appendMessage).mockReturnValue();
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
  });

  it('Step 1 – WEB_SEARCH: saves grounding notes as internal message', async () => {
    vi.mocked(getMessages).mockReturnValue([]);

    vi.mocked(streamChat).mockImplementation(async function* () {
      yield { token: 'AI is advancing fast.', model: 'gemini' };
      yield {
        internalNote: 'Queries: AI news 2026\nSources:\n- TechCrunch: https://tc.com/ai',
        model: 'gemini',
      };
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'latest AI news', intent: Intent.WEB_SEARCH });

    expect(res.status).toBe(200);

    const persistedCalls = vi.mocked(appendMessage).mock.calls;
    const internalMsg = persistedCalls.find((c) => c[1].role === 'internal');
    expect(internalMsg).toBeDefined();
    expect(internalMsg![1].content).toContain('TechCrunch');

    // Internal note should NOT appear in SSE stream as a token
    const events = parseSSEEvents(res.text);
    const tokenValues = events.filter((e) => e.type === 'token').map((e) => e.content);
    expect(tokenValues.every((v) => !(v as string).includes('TechCrunch'))).toBe(true);
  });

  it('Step 2 – DRAFTING: injects prior search notes into system context', async () => {
    // Stored history now includes the internal note from the search
    vi.mocked(getMessages).mockReturnValue([
      { role: 'user', content: 'latest AI news', created_at: '' },
      { role: 'assistant', content: 'AI is advancing fast.', model: 'gemini', created_at: '' },
      {
        role: 'internal',
        content: 'Queries: AI news 2026\nSources:\n- TechCrunch: https://tc.com/ai',
        model: 'gemini',
        created_at: '',
      },
    ] as any);

    let capturedMessages: unknown[] = [];
    vi.mocked(streamChat).mockImplementation(async function* (msgs) {
      capturedMessages = msgs;
      yield { token: 'Blog post content here.', model: 'groq-chat' };
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'write a blog post', intent: Intent.DRAFTING });

    expect(res.status).toBe(200);

    // Verify the system prompt contains research notes
    const systemMsg = capturedMessages.find((m: any) => m.role === 'system') as
      | { role: string; content: string }
      | undefined;
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain('Research Notes');
    expect(systemMsg!.content).toContain('TechCrunch');

    // Verify internal messages are NOT passed as conversation history
    const chatHistory = capturedMessages.filter((m: any) => m.role !== 'system');
    expect(chatHistory.every((m: any) => m.role !== 'internal')).toBe(true);

    const events = parseSSEEvents(res.text);
    expect(events.find((e) => e.type === 'done')).toBeDefined();
  });

  it('Full two-request relay flow: search → draft with accumulated context', async () => {
    const persistedMessages: any[] = [];

    vi.mocked(getMessages).mockImplementation(() => persistedMessages);
    vi.mocked(appendMessage).mockImplementation((_id, msg) => {
      persistedMessages.push(msg);
    });

    // Request 1: WEB_SEARCH
    vi.mocked(streamChat).mockImplementationOnce(async function* () {
      yield { token: 'Found: AI news.', model: 'gemini' };
      yield { internalNote: 'Queries: AI\nSources:\n- Site: https://ai.example.com', model: 'gemini' };
    } as any);

    const r1 = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'search AI', intent: Intent.WEB_SEARCH });

    expect(r1.status).toBe(200);
    expect(persistedMessages.some((m) => m.role === 'internal')).toBe(true);

    // Request 2: DRAFTING — should see the internal note in system context
    let draftCaptured: unknown[] = [];
    vi.mocked(streamChat).mockImplementationOnce(async function* (msgs) {
      draftCaptured = msgs;
      yield { token: 'Draft using research.', model: 'groq-chat' };
    } as any);

    const r2 = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'write blog', intent: Intent.DRAFTING });

    expect(r2.status).toBe(200);

    const sysMsg = draftCaptured.find((m: any) => m.role === 'system') as
      | { role: string; content: string }
      | undefined;
    expect(sysMsg?.content).toContain('Research Notes');
    expect(sysMsg?.content).toContain('ai.example.com');

    const r2Events = parseSSEEvents(r2.text);
    expect(r2Events.find((e) => e.type === 'done')).toBeDefined();
  });
});

describe('E2E: Request validation', () => {
  let app: express.Application;
  let cookie: string;

  beforeAll(async () => {
    app = buildApp();
    cookie = await makeAuthCookie(app);
  });

  beforeEach(() => { vi.clearAllMocks(); });

  it.each([
    { conversationId: 'not-a-uuid', content: 'hi' },
    { conversationId: CONV_ID, content: 'x'.repeat(33000) },
    { conversationId: CONV_ID, content: 'hi', intent: 'NOT_VALID' },
  ])('returns 400 for invalid payload %o', async (body) => {
    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 404 when conversation does not exist', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null);
    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });
    expect(res.status).toBe(404);
  });

  it('accepts all valid Intent enum values', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();

    for (const intent of Object.values(Intent)) {
      vi.mocked(streamChat).mockImplementation(
        () => makeTokenStream({ token: 'ok', model: 'test' }) as any,
      );

      const res = await request(app)
        .post('/api/chat/send')
        .set('Cookie', cookie)
        .send({ conversationId: CONV_ID, content: 'test message', intent });

      expect(res.status).toBe(200);
      const events = parseSSEEvents(res.text);
      expect(events.find((e) => e.type === 'done')).toBeDefined();
    }
  });
});

describe('E2E: Error handling and edge cases', () => {
  let app: express.Application;
  let cookie: string;

  beforeAll(async () => {
    app = buildApp();
    cookie = await makeAuthCookie(app);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConversationMeta).mockReturnValue(CONV_META);
    vi.mocked(getMessages).mockReturnValue([]);
    vi.mocked(appendMessage).mockReturnValue();
  });

  it('emits error event on generic provider failure', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('Something went wrong');
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });

    const events = parseSSEEvents(res.text);
    expect(events.find((e) => e.type === 'error')).toBeDefined();
  });

  it('emits rate-limit-specific error message on rate limit', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('rate limit exceeded');
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'test' });

    const events = parseSSEEvents(res.text);
    const err = events.find((e) => e.type === 'error');
    expect((err?.message as string).toLowerCase()).toContain('rate limit');
  });

  it('emits timeout error message on timeout', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      throw new Error('Request timeout occurred');
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'test' });

    const events = parseSSEEvents(res.text);
    const err = events.find((e) => e.type === 'error');
    expect((err?.message as string).toLowerCase()).toContain('timed out');
  });

  it('handles stream that yields no tokens gracefully', async () => {
    vi.mocked(streamChat).mockImplementation(async function* () {
      // no yields
    } as any);

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    expect(events.some((e) => e.type === 'error' || e.type === 'done')).toBe(true);
  });

  it('handles history load failure gracefully', async () => {
    vi.mocked(getMessages).mockImplementation(() => {
      throw new Error('disk read failure');
    });

    const res = await request(app)
      .post('/api/chat/send')
      .set('Cookie', cookie)
      .send({ conversationId: CONV_ID, content: 'hello' });

    expect(res.status).toBe(200);
    const events = parseSSEEvents(res.text);
    expect(events.find((e) => e.type === 'error')).toBeDefined();
  });
});
