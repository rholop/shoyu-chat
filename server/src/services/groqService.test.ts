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

import { streamChatGroq, summarizeGroq } from './groqService';
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

describe('groqService', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  describe('streamChatGroq', () => {
    it('uses primary model (llama-3.3-70b-versatile) by default', async () => {
      mockCreate.mockResolvedValueOnce(makeStream(['hello']));

      await collect(streamChatGroq([{ role: 'user', content: 'hi' }]));

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
      );
    });

    it('falls back to llama-3.1-8b-instant on 429 from primary', async () => {
      mockCreate
        .mockRejectedValueOnce(rateLimitError())
        .mockResolvedValueOnce(makeStream(['fallback']));

      const tokens = await collect(streamChatGroq([{ role: 'user', content: 'hi' }]));

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
        collect(streamChatGroq([{ role: 'user', content: 'hi' }])),
      ).rejects.toThrow('server error');

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('throws if fallback also fails', async () => {
      mockCreate
        .mockRejectedValueOnce(rateLimitError())
        .mockRejectedValueOnce(new Error('fallback error'));

      await expect(
        collect(streamChatGroq([{ role: 'user', content: 'hi' }])),
      ).rejects.toThrow('fallback error');
    });
  });

  describe('summarizeGroq', () => {
    it('uses primary model by default', async () => {
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });

      const result = await summarizeGroq('summarize this');

      expect(result).toBe('summary');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
      );
    });

    it('falls back to llama-3.1-8b-instant on 429 from primary', async () => {
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
  });
});
