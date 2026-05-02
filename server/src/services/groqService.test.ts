import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

vi.mock('../utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { streamChatGroqCompound, streamChatGroqChat, summarizeGroq, isGroqAvailable } from './groqService';
import { logger } from '../utils/logger';

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const t of gen) results.push(t);
  return results;
}

function makeStream(tokens: string[]) {
  return (async function* () {
    for (const t of tokens) yield { choices: [{ delta: { content: t } }] };
  })();
}

function rateLimitError() {
  return Object.assign(new Error('rate limit'), { status: 429 });
}

describe('isGroqAvailable', () => {
  it('returns true when GROQ_API_KEY is set', () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    expect(isGroqAvailable()).toBe(true);
    delete process.env.GROQ_API_KEY;
  });

  it('returns false when GROQ_API_KEY is absent', () => {
    delete process.env.GROQ_API_KEY;
    expect(isGroqAvailable()).toBe(false);
  });
});

describe('streamChatGroqCompound', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('calls the groq/compound model', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatGroqCompound([{ role: 'user', content: 'hi' }]));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'groq/compound' }),
    );
  });

  it('yields tokens from the stream', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['Hello', ' world']));
    const tokens = await collect(streamChatGroqCompound([{ role: 'user', content: 'hi' }]));
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('strips images from messages (text-only model)', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(
      streamChatGroqCompound([
        {
          role: 'user',
          content: 'Look at this',
          images: [{ mimeType: 'image/png', base64: 'abc', filename: 'img.png' }],
        },
      ]),
    );
    const calledMessages = mockCreate.mock.calls[0][0].messages;
    expect(calledMessages[0]).toEqual({ role: 'user', content: 'Look at this' });
  });

  it('propagates non-rate-limit errors', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }));
    await expect(
      collect(streamChatGroqCompound([{ role: 'user', content: 'hi' }])),
    ).rejects.toThrow('server error');
  });
});

describe('streamChatGroqChat (DEBUGGING and DRAFTING specialist)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('uses llama-3.3-70b-versatile by default', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatGroqChat([{ role: 'user', content: 'hi' }]));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
    );
  });

  it('handles DEBUGGING-style queries (error logs)', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['Fix: use ===']));
    const result = await collect(
      streamChatGroqChat([{ role: 'user', content: 'TypeError: cannot read undefined' }]),
    );
    expect(result).toEqual(['Fix: use ===']);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
    );
  });

  it('handles DRAFTING-style queries (article generation)', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['# Article\n\nContent here']));
    const result = await collect(
      streamChatGroqChat([{ role: 'user', content: 'Write an article about AI' }]),
    );
    expect(result).toEqual(['# Article\n\nContent here']);
  });

  it('passes system messages through to the API', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(
      streamChatGroqChat([
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'hello' },
      ]),
    );
    const calledMessages = mockCreate.mock.calls[0][0].messages;
    expect(calledMessages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' });
  });

  it('falls back to llama-3.1-8b-instant on 429', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce(makeStream(['fallback']));

    const tokens = await collect(streamChatGroqChat([{ role: 'user', content: 'hi' }]));
    expect(tokens).toEqual(['fallback']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'llama-3.1-8b-instant' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not fall back on non-429 errors', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }));
    await expect(
      collect(streamChatGroqChat([{ role: 'user', content: 'hi' }])),
    ).rejects.toThrow('server error');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws if fallback also fails', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(new Error('fallback error'));
    await expect(
      collect(streamChatGroqChat([{ role: 'user', content: 'hi' }])),
    ).rejects.toThrow('fallback error');
  });
});

describe('summarizeGroq', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('uses llama-3.3-70b-versatile by default', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });
    const result = await summarizeGroq('summarize this');
    expect(result).toBe('summary');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
    );
  });

  it('falls back to llama-3.1-8b-instant on 429', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce({ choices: [{ message: { content: 'fallback summary' } }] });

    const result = await summarizeGroq('summarize this');
    expect(result).toBe('fallback summary');
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'llama-3.1-8b-instant' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not fall back on non-429 errors', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(summarizeGroq('summarize this')).rejects.toThrow('bad request');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns empty string when choice content is null', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: null } }] });
    const result = await summarizeGroq('test');
    expect(result).toBe('');
  });
});
