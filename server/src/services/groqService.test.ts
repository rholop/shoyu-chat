import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { streamChatGroqChat, summarizeGroq, isGroqAvailable } from './groqService';

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

describe('groqService v4.0', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('streamChatGroqChat calls specified model', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatGroqChat([{ role: 'user', content: 'hi' }], 'custom-model'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('yields tokens from the stream', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['Hello', ' Groq']));
    const tokens = await collect(streamChatGroqChat([{ role: 'user', content: 'hi' }]));
    expect(tokens).toEqual(['Hello', ' Groq']);
  });

  it('summarizeGroq calls specified model', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });
    const result = await summarizeGroq('summarize this', 'custom-model');
    expect(result).toBe('summary');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('passes 60s timeout to create()', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(streamChatGroqChat([{ role: 'user', content: 'hi' }]));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('isGroqAvailable returns correctly', () => {
    process.env.GROQ_API_KEY = 'test';
    expect(isGroqAvailable()).toBe(true);
    delete process.env.GROQ_API_KEY;
    expect(isGroqAvailable()).toBe(false);
  });
});
