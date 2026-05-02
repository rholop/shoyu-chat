import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import {
  streamChatOpenRouter,
  streamChatOpenRouterTranslating,
  summarizeOpenRouter,
  isOpenRouterAvailable,
} from './openrouterService';
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

describe('streamChatOpenRouter (default – llama-3.1-8b-instruct:free)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls meta-llama/llama-3.1-8b-instruct:free model', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['Hello']));
    const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    await collect(streamChatOpenRouter(msgs));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'meta-llama/llama-3.1-8b-instruct:free' }),
    );
  });

  it('yields non-empty delta content', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['Hello', undefined, ' world']));
    const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    const tokens = await collect(streamChatOpenRouter(msgs));
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('returns empty array when all deltas are undefined', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable([undefined, undefined]));
    const tokens = await collect(streamChatOpenRouter([{ role: 'user', content: 'hi' }]));
    expect(tokens).toEqual([]);
  });
});

describe('streamChatOpenRouterTranslating (TRANSLATING intent – mistral-large)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls mistralai/mistral-large model', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['Bonjour']));
    const msgs: ChatMessage[] = [{ role: 'user', content: 'translate: Hello' }];
    await collect(streamChatOpenRouterTranslating(msgs));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mistralai/mistral-large' }),
    );
  });

  it('yields translated tokens', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['Bonjour', ' le', ' monde']));
    const msgs: ChatMessage[] = [{ role: 'user', content: 'translate: Hello world' }];
    const tokens = await collect(streamChatOpenRouterTranslating(msgs));
    expect(tokens).toEqual(['Bonjour', ' le', ' monde']);
  });

  it('skips undefined delta content', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['Hola', undefined, ' mundo']));
    const tokens = await collect(
      streamChatOpenRouterTranslating([{ role: 'user', content: 'translate' }]),
    );
    expect(tokens).toEqual(['Hola', ' mundo']);
  });

  it('uses stream:true', async () => {
    mockCreate.mockResolvedValue(makeStreamIterable(['ok']));
    await collect(streamChatOpenRouterTranslating([{ role: 'user', content: 'hi' }]));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ stream: true }),
    );
  });
});

describe('summarizeOpenRouter', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('uses the llama free model (not mistral) for summarization', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    await summarizeOpenRouter('test');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'meta-llama/llama-3.1-8b-instruct:free' }),
    );
  });
});
