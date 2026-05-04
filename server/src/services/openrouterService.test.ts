import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn(function () { return { chat: { completions: { create: mockCreate } } }; }),
}));

import OpenAI from 'openai';
import { streamChatOpenRouter, summarizeOpenRouter, isOpenRouterAvailable, isRateLimitError } from './openrouterService';

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

describe('openrouterService v4.0', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('streamChatOpenRouter calls specified model', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'custom-model'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('yields tokens from the stream', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce(makeStream(['Hello', ' OpenRouter']));
    const tokens = await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model'));
    expect(tokens).toEqual(['Hello', ' OpenRouter']);
  });

  it('summarizeOpenRouter calls specified model', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });
    const result = await summarizeOpenRouter('summarize this', 'custom-model');
    expect(result).toBe('summary');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('passes 60s timeout to create()', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('isOpenRouterAvailable returns correctly', () => {
    process.env.OPENROUTER_API_KEY = 'test';
    expect(isOpenRouterAvailable()).toBe(true);
    delete process.env.OPENROUTER_API_KEY;
    expect(isOpenRouterAvailable()).toBe(false);
  });

  it('handles stream chunks without choices (reproduction of crash)', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const streamWithMetadata = (async function* () {
      yield { choices: [{ delta: { content: 'hello' } }] };
      yield { usage: { prompt_tokens: 10, completion_tokens: 5 } }; // No choices!
    })();
    mockCreate.mockResolvedValueOnce(streamWithMetadata);

    const tokens = await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model'));
    expect(tokens).toEqual(['hello']);
  });

  // --- New tests below ---

  it('client is instantiated with correct baseURL and required headers', () => {
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: expect.objectContaining({
          'HTTP-Referer': 'https://holop.dev',
          'X-Title': 'shoyu-chat',
        }),
      }),
    );
  });

  it('throws on 429 and isRateLimitError() identifies it', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const rateLimitErr = { status: 429, message: 'Too Many Requests' };
    mockCreate.mockRejectedValueOnce(rateLimitErr);

    let caught: unknown;
    try {
      await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model'));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(rateLimitErr);
    expect(isRateLimitError(caught)).toBe(true);
    expect(isRateLimitError({ status: 500 })).toBe(false);
    expect(isRateLimitError(new Error('network error'))).toBe(false);
  });

  it('strips Perplexity citation metadata — yields only text content', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const streamWithCitations = (async function* () {
      yield { choices: [{ delta: { content: 'Paris is the capital of France.' } }] };
      // Final chunk: empty content + top-level citations field (Perplexity pattern)
      yield { choices: [{ delta: { content: '' } }], citations: ['https://en.wikipedia.org/wiki/Paris'] };
    })();
    mockCreate.mockResolvedValueOnce(streamWithCitations);

    const tokens = await collect(streamChatOpenRouter([{ role: 'user', content: 'What is the capital of France?' }], 'perplexity/sonar-pro'));
    // Empty-string content is filtered by `if (text)`, citations field is never read
    expect(tokens).toEqual(['Paris is the capital of France.']);
  });

  it('throws a clear OPENROUTER_API_KEY error when key is missing', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    let streamErr: unknown;
    try {
      const gen = streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model');
      await gen.next();
    } catch (e) {
      streamErr = e;
    }
    expect(streamErr).toBeInstanceOf(Error);
    expect((streamErr as Error).message).toMatch(/OPENROUTER_API_KEY/);

    let summarizeErr: unknown;
    try {
      await summarizeOpenRouter('prompt', 'some-model');
    } catch (e) {
      summarizeErr = e;
    }
    expect(summarizeErr).toBeInstanceOf(Error);
    expect((summarizeErr as Error).message).toMatch(/OPENROUTER_API_KEY/);

    if (saved) process.env.OPENROUTER_API_KEY = saved;
  });
});
