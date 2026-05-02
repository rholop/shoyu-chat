import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { streamChatOpenRouter, summarizeOpenRouter, isOpenRouterAvailable } from './openrouterService';

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
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'custom-model'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('yields tokens from the stream', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['Hello', ' OpenRouter']));
    const tokens = await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model'));
    expect(tokens).toEqual(['Hello', ' OpenRouter']);
  });

  it('summarizeOpenRouter calls specified model', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });
    const result = await summarizeOpenRouter('summarize this', 'custom-model');
    expect(result).toBe('summary');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('passes 60s timeout to create()', async () => {
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
    const streamWithMetadata = (async function* () {
      yield { choices: [{ delta: { content: 'hello' } }] };
      yield { usage: { prompt_tokens: 10, completion_tokens: 5 } }; // No choices!
    })();
    mockCreate.mockResolvedValueOnce(streamWithMetadata);

    const tokens = await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }], 'some-model'));
    expect(tokens).toEqual(['hello']);
  });
});
