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

import { streamChatNvidia, streamChatNvidiaCoding, summarizeNvidia, isNvidiaAvailable } from './nvidiaService';
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

describe('nvidiaService – streamChatNvidia', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('calls the primary model (qwen)', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatNvidia([{ role: 'user', content: 'hi' }]));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen/qwen3.5-397b-a17b' }),
    );
  });

  it('yields tokens from the stream', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['Hello', ' world']));
    const tokens = await collect(streamChatNvidia([{ role: 'user', content: 'hi' }]));
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('strips images from messages (text-only model)', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(
      streamChatNvidia([
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

  it('falls back to nemotron on 429', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce(makeStream(['fallback']));

    const tokens = await collect(streamChatNvidia([{ role: 'user', content: 'hi' }]));
    expect(tokens).toEqual(['fallback']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'nvidia/nemotron-3-super-120b-a12b' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not fall back on non-429 errors', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }));
    await expect(collect(streamChatNvidia([{ role: 'user', content: 'hi' }]))).rejects.toThrow(
      'server error',
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('throws if fallback also fails', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())
      .mockRejectedValueOnce(new Error('fallback error'));
    await expect(collect(streamChatNvidia([{ role: 'user', content: 'hi' }]))).rejects.toThrow(
      'fallback error',
    );
  });
});

describe('nvidiaService – streamChatNvidiaCoding (CODING intent)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('calls meta/llama-3.1-405b-instruct as the primary model', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['function hello() {}']));
    await collect(streamChatNvidiaCoding([{ role: 'user', content: 'write a function' }]));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'meta/llama-3.1-405b-instruct' }),
    );
  });

  it('yields tokens from the coding model stream', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['const', ' x', ' =', ' 1']));
    const tokens = await collect(
      streamChatNvidiaCoding([{ role: 'user', content: 'code' }]),
    );
    expect(tokens).toEqual(['const', ' x', ' =', ' 1']);
  });

  it('strips images from messages', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(
      streamChatNvidiaCoding([
        {
          role: 'user',
          content: 'refactor this',
          images: [{ mimeType: 'image/png', base64: 'abc', filename: 'img.png' }],
        },
      ]),
    );
    const calledMessages = mockCreate.mock.calls[0][0].messages;
    expect(calledMessages[0]).toEqual({ role: 'user', content: 'refactor this' });
  });

  it('falls back to qwen on 429 from coding model', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())   // 405b fails
      .mockResolvedValueOnce(makeStream(['qwen fallback']));  // qwen succeeds

    const tokens = await collect(
      streamChatNvidiaCoding([{ role: 'user', content: 'code' }]),
    );
    expect(tokens).toEqual(['qwen fallback']);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: 'meta/llama-3.1-405b-instruct' }),
    );
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'qwen/qwen3.5-397b-a17b' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('falls back to nemotron on 429 from both 405b and qwen', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())   // 405b fails
      .mockRejectedValueOnce(rateLimitError())   // qwen fails
      .mockResolvedValueOnce(makeStream(['nemotron']));  // nemotron succeeds

    const tokens = await collect(
      streamChatNvidiaCoding([{ role: 'user', content: 'code' }]),
    );
    expect(tokens).toEqual(['nemotron']);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockCreate).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ model: 'nvidia/nemotron-3-super-120b-a12b' }),
    );
  });

  it('does not fall back on non-429 errors', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(
      collect(streamChatNvidiaCoding([{ role: 'user', content: 'code' }])),
    ).rejects.toThrow('bad request');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('nvidiaService – summarizeNvidia', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('uses the primary model by default', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });
    const result = await summarizeNvidia('summarize this');
    expect(result).toBe('summary');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'qwen/qwen3.5-397b-a17b' }),
    );
  });

  it('falls back to nemotron on 429', async () => {
    mockCreate
      .mockRejectedValueOnce(rateLimitError())
      .mockResolvedValueOnce({ choices: [{ message: { content: 'fallback summary' } }] });

    const result = await summarizeNvidia('summarize this');
    expect(result).toBe('fallback summary');
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'nvidia/nemotron-3-super-120b-a12b' }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not fall back on non-429 errors', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(summarizeNvidia('summarize this')).rejects.toThrow('bad request');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('nvidiaService – isNvidiaAvailable', () => {
  it('returns true when NVIDIA_API_KEY is set', () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test';
    expect(isNvidiaAvailable()).toBe(true);
    delete process.env.NVIDIA_API_KEY;
  });

  it('returns false when NVIDIA_API_KEY is not set', () => {
    delete process.env.NVIDIA_API_KEY;
    expect(isNvidiaAvailable()).toBe(false);
  });
});
