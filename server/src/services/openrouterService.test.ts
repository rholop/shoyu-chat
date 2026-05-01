import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { streamChatOpenRouter, summarizeOpenRouter, isOpenRouterAvailable } from './openrouterService';
import { ChatMessage } from './groqService';

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

function makeStreamIterable(deltas: Array<string | undefined>) {
  return (async function* () {
    for (const d of deltas) yield { choices: [{ delta: { content: d } }] };
  })();
}

describe('isOpenRouterAvailable', () => {
  it('returns true when OPENROUTER_API_KEY is set', () => {
    process.env.OPENROUTER_API_KEY = 'key';
    expect(isOpenRouterAvailable()).toBe(true);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('returns false when key is absent', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(isOpenRouterAvailable()).toBe(false);
  });
});

describe('streamChatOpenRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('yields non-empty delta content', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['Hello', undefined, ' world']));
    const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    const tokens = await collect(streamChatOpenRouter(msgs));
    expect(tokens).toEqual(['Hello', ' world']);
  });
});

describe('summarizeOpenRouter', () => {
  it('returns the first choice message content', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'summary here' } }],
    });
    const result = await summarizeOpenRouter('prompt');
    expect(result).toBe('summary here');
  });

  it('returns empty string when choices are empty', async () => {
    mockCreate.mockResolvedValue({ choices: [] });
    const result = await summarizeOpenRouter('prompt');
    expect(result).toBe('');
  });
});
