import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendMessage } from './chat';

function makeStream(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function mockSuccessResponse(chunks: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: makeStream(chunks),
    json: vi.fn(),
  });
}

function mockErrorResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
}

describe('sendMessage (SSE parser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /api/chat/send with conversationId, content, and attachments', async () => {
    vi.stubGlobal('fetch', mockSuccessResponse([]));
    const gen = sendMessage('conv-1', 'hello');
    for await (const _ of gen) { /* drain */ }
    expect(fetch).toHaveBeenCalledWith('/api/chat/send', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ conversationId: 'conv-1', content: 'hello', attachments: [] }),
      credentials: 'include',
    }));
  });

  it('throws when response is not ok', async () => {
    vi.stubGlobal('fetch', mockErrorResponse(400, { error: 'Invalid request' }));
    const gen = sendMessage('conv-1', 'hello');
    await expect(async () => { for await (const _ of gen) {} }).rejects.toThrow('Invalid request');
  });

  it('yields token events from SSE stream', async () => {
    const chunks = ['data: {"type":"token","content":"Hello"}\n\ndata: {"type":"token","content":" world"}\n\n'];
    vi.stubGlobal('fetch', mockSuccessResponse(chunks));

    const events = [];
    for await (const event of sendMessage('conv-1', 'hi')) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
    expect(events[1]).toEqual({ type: 'token', content: ' world' });
  });

  it('yields done event', async () => {
    const chunks = ['data: {"type":"done","model":"groq-chat","conversationId":"conv-1"}\n\n'];
    vi.stubGlobal('fetch', mockSuccessResponse(chunks));

    const events = [];
    for await (const event of sendMessage('conv-1', 'hi')) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'done', model: 'groq-chat', conversationId: 'conv-1' });
  });

  it('yields error event', async () => {
    const chunks = ['data: {"type":"error","message":"quota exceeded"}\n\n'];
    vi.stubGlobal('fetch', mockSuccessResponse(chunks));

    const events = [];
    for await (const event of sendMessage('conv-1', 'hi')) {
      events.push(event);
    }
    expect(events[0]).toEqual({ type: 'error', message: 'quota exceeded' });
  });

  it('handles events split across multiple chunks', async () => {
    const chunks = [
      'data: {"type":"token","cont',
      'ent":"Hello"}\n\n',
    ];
    vi.stubGlobal('fetch', mockSuccessResponse(chunks));

    const events = [];
    for await (const event of sendMessage('conv-1', 'hi')) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'token', content: 'Hello' });
  });

  it('handles multiple events in one chunk', async () => {
    const chunk = [
      'data: {"type":"token","content":"A"}\n\n',
      'data: {"type":"token","content":"B"}\n\n',
      'data: {"type":"done","model":"groq-chat","conversationId":"c"}\n\n',
    ].join('');
    vi.stubGlobal('fetch', mockSuccessResponse([chunk]));

    const events = [];
    for await (const event of sendMessage('conv-1', 'hi')) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
  });

  it('silently skips malformed JSON chunks', async () => {
    const chunks = [
      'data: not-valid-json\n\ndata: {"type":"done","model":"groq-chat","conversationId":"c"}\n\n',
    ];
    vi.stubGlobal('fetch', mockSuccessResponse(chunks));

    const events = [];
    for await (const event of sendMessage('conv-1', 'hi')) {
      events.push(event);
    }
    // Malformed chunk is skipped, valid done event is yielded
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('done');
  });

  it('uses fallback error message when error body has no message field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    });
    vi.stubGlobal('fetch', fetchMock);
    const gen = sendMessage('conv-1', 'hi');
    await expect(async () => { for await (const _ of gen) {} }).rejects.toThrow('Chat request failed');
  });
});
