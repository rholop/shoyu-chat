import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat, summarize, Intent } from './aiRouter';
import { ChatMessage } from './groqService';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../storage', () => ({
  getUsageCount: vi.fn(),
  incrementUsage: vi.fn(),
}));

vi.mock('./groqService', () => ({
  streamChatGroq: vi.fn(),
  summarizeGroq: vi.fn(),
  isGroqAvailable: vi.fn(),
}));

vi.mock('./geminiService', () => ({
  streamChatGemini: vi.fn(),
  streamChatGeminiWithSearch: vi.fn(),
  summarizeGemini: vi.fn(),
  isGeminiAvailable: vi.fn(),
}));

vi.mock('./openrouterService', () => ({
  streamChatOpenRouter: vi.fn(),
  summarizeOpenRouter: vi.fn(),
  isOpenRouterAvailable: vi.fn(),
}));

vi.mock('./nvidiaService', () => ({
  streamChatNvidia: vi.fn(),
  isNvidiaAvailable: vi.fn(),
}));

vi.mock('./memoryService', () => ({
  readMemory: vi.fn(),
}));

vi.mock('../utils/dateHelpers', () => ({
  getToday: vi.fn().mockReturnValue('2026-05-02'),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getUsageCount, incrementUsage } from '../storage';
import { streamChatGroq, isGroqAvailable, summarizeGroq } from './groqService';
import { streamChatGemini, streamChatGeminiWithSearch, isGeminiAvailable, summarizeGemini } from './geminiService';
import { streamChatOpenRouter, isOpenRouterAvailable, summarizeOpenRouter } from './openrouterService';
import { streamChatNvidia, isNvidiaAvailable } from './nvidiaService';
import { readMemory } from './memoryService';

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function collectStream(gen: AsyncGenerator<{ type: string; token?: string; content?: string; model: string }>) {
  const tokens: string[] = [];
  const internals: string[] = [];
  let model = '';
  for await (const result of gen) {
    if (result.type === 'token' && result.token) {
      tokens.push(result.token);
      model = result.model;
    } else if (result.type === 'internal' && result.content) {
      internals.push(result.content);
    }
  }
  return { tokens, internals, model };
}

// ── Memory injection ──────────────────────────────────────────────────────────

describe('memory injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
    vi.mocked(isNvidiaAvailable).mockReturnValue(false);
    vi.mocked(streamChatGroq).mockImplementation(async function* () { yield 'ok'; });
  });

  it('prepends system message with memory context when memory exists', async () => {
    vi.mocked(readMemory).mockReturnValue('## Identity\n- Name: Alice');

    await collectStream(streamChat(messages));

    const callArgs = vi.mocked(streamChatGroq).mock.calls[0][0];
    expect(callArgs[0].role).toBe('system');
    expect(callArgs[0].content).toContain('User Memory Context');
    expect(callArgs[0].content).toContain('Name: Alice');
  });

  it('does not prepend system message when memory file is absent', async () => {
    vi.mocked(readMemory).mockReturnValue(null);

    await collectStream(streamChat(messages));

    const callArgs = vi.mocked(streamChatGroq).mock.calls[0][0];
    expect(callArgs[0].role).toBe('user');
  });

  it('skips memory injection when injectMemory is false', async () => {
    vi.mocked(readMemory).mockReturnValue('## Identity\n- Name: Alice');

    await collectStream(streamChat(messages, 'DEFAULT', false));

    const callArgs = vi.mocked(streamChatGroq).mock.calls[0][0];
    expect(callArgs[0].role).not.toBe('system');
    expect(readMemory).not.toHaveBeenCalled();
  });
});

// ── Default fallback routing ──────────────────────────────────────────────────

describe('streamChat — DEFAULT intent (fallback routing)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('throws QUOTA_EXCEEDED when no providers are available', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(false);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
    vi.mocked(isNvidiaAvailable).mockReturnValue(false);

    await expect(collectStream(streamChat(messages))).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('throws QUOTA_EXCEEDED when all providers are at limit', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(999999);

    await expect(collectStream(streamChat(messages))).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('yields tokens from Groq when it is available', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield 'Hello';
      yield ' world';
    });

    const { tokens, model } = await collectStream(streamChat(messages));

    expect(tokens).toEqual(['Hello', ' world']);
    expect(model).toBe('groq-chat');
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-05-02');
  });

  it('falls back to Gemini when Groq fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      throw new Error('Groq error');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Fallback response';
    });

    const { tokens, model } = await collectStream(streamChat(messages));

    expect(tokens).toEqual(['Fallback response']);
    expect(model).toBe('gemini');
  });

  it('does not increment usage when provider is at daily limit', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(14400);

    await expect(collectStream(streamChat(messages))).rejects.toThrow('QUOTA_EXCEEDED');
    expect(incrementUsage).not.toHaveBeenCalled();
  });
});

// ── WEB_SEARCH intent ─────────────────────────────────────────────────────────

describe('streamChat — WEB_SEARCH intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('calls streamChatGeminiWithSearch (not streamChatGemini) for WEB_SEARCH', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield { token: 'React 19 was released in' };
      yield { token: ' early 2025.' };
      yield { groundingContent: '## Web Search Context\n- [React Blog](https://react.dev)' };
    });

    await collectStream(streamChat(messages, 'WEB_SEARCH'));

    expect(streamChatGeminiWithSearch).toHaveBeenCalled();
    expect(streamChatGemini).not.toHaveBeenCalled();
  });

  it('includes tool definitions (grounding content) in stream results for WEB_SEARCH', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield { token: 'Search result text.' };
      yield { groundingContent: '## Web Search Context\n**Search queries:** React version\n- [React Blog](https://react.dev)' };
    });

    const { tokens, internals } = await collectStream(streamChat(messages, 'WEB_SEARCH'));

    expect(tokens).toContain('Search result text.');
    expect(internals).toHaveLength(1);
    expect(internals[0]).toContain('Web Search Context');
    expect(internals[0]).toContain('react.dev');
  });

  it('uses gemini usage key for WEB_SEARCH', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield { token: 'answer' };
    });

    await collectStream(streamChat(messages, 'WEB_SEARCH'));

    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-05-02');
  });

  it('falls back to default chain when Gemini is unavailable for WEB_SEARCH', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield 'Fallback answer';
    });

    const { tokens } = await collectStream(streamChat(messages, 'WEB_SEARCH'));

    expect(tokens).toContain('Fallback answer');
    expect(streamChatGeminiWithSearch).not.toHaveBeenCalled();
  });
});

// ── CODING intent ─────────────────────────────────────────────────────────────

describe('streamChat — CODING intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('routes CODING to NVIDIA Llama 405B when available', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidia).mockImplementation(async function* () {
      yield 'Here is the code:';
    });

    const { model } = await collectStream(streamChat(messages, 'CODING'));

    expect(streamChatNvidia).toHaveBeenCalled();
    expect(model).toBe('nvidia-llama-405b');
  });

  it('falls back to default chain when NVIDIA is unavailable for CODING', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(false);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield 'Fallback code';
    });

    const { tokens } = await collectStream(streamChat(messages, 'CODING'));

    expect(tokens).toContain('Fallback code');
    expect(streamChatNvidia).not.toHaveBeenCalled();
  });
});

// ── DEBUGGING intent ──────────────────────────────────────────────────────────

describe('streamChat — DEBUGGING intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('routes DEBUGGING to Groq llama-3.3-70b-versatile', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield 'Debug output';
    });

    const { model } = await collectStream(streamChat(messages, 'DEBUGGING'));

    expect(streamChatGroq).toHaveBeenCalledWith(
      expect.any(Array),
      'llama-3.3-70b-versatile'
    );
    expect(model).toBe('groq-llama-versatile');
  });
});

// ── DRAFTING intent ───────────────────────────────────────────────────────────

describe('streamChat — DRAFTING intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('routes DRAFTING to Groq llama-3.3-70b-versatile', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield 'Drafted text';
    });

    await collectStream(streamChat(messages, 'DRAFTING'));

    expect(streamChatGroq).toHaveBeenCalledWith(
      expect.any(Array),
      'llama-3.3-70b-versatile'
    );
  });
});

// ── TRANSLATING intent ────────────────────────────────────────────────────────

describe('streamChat — TRANSLATING intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('routes TRANSLATING to Mistral Large via OpenRouter', async () => {
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(streamChatOpenRouter).mockImplementation(async function* () {
      yield 'Translated text';
    });

    const { model } = await collectStream(streamChat(messages, 'TRANSLATING'));

    expect(streamChatOpenRouter).toHaveBeenCalledWith(
      expect.any(Array),
      'mistralai/mistral-large'
    );
    expect(model).toBe('mistral-large');
  });
});

// ── VISUALS intent ────────────────────────────────────────────────────────────

describe('streamChat — VISUALS intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('routes VISUALS to Gemini (standard, no search)', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Image description';
    });

    const { model } = await collectStream(streamChat(messages, 'VISUALS'));

    expect(streamChatGemini).toHaveBeenCalled();
    expect(streamChatGeminiWithSearch).not.toHaveBeenCalled();
    expect(model).toBe('gemini');
  });
});

// ── Relay chain integration ───────────────────────────────────────────────────

describe('relay chain integration: Search → Code → Draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(readMemory).mockReturnValue(null);
  });

  it('WEB_SEARCH produces internal search notes that do not appear in token stream', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield { token: 'React 19 info...' };
      yield { groundingContent: '## Web Search Context\n- [react.dev](https://react.dev)' };
    });

    const { tokens, internals } = await collectStream(streamChat(messages, 'WEB_SEARCH'));

    // Tokens visible to user
    expect(tokens).toEqual(['React 19 info...']);
    // Internal messages are captured separately (stored in .ndjson, not streamed)
    expect(internals).toHaveLength(1);
    expect(internals[0]).toContain('Web Search Context');
  });

  it('CODING intent receives context and calls NVIDIA', async () => {
    const contextMessages: ChatMessage[] = [
      { role: 'user', content: '[Search Context]\n## Web Search Context\n- [react.dev](https://react.dev)' },
      { role: 'user', content: 'Write a hook using the latest React API' },
    ];

    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidia).mockImplementation(async function* () {
      yield 'const useHook = () => {};';
    });

    const { tokens, model } = await collectStream(streamChat(contextMessages, 'CODING'));

    expect(tokens).toContain('const useHook = () => {};');
    expect(model).toBe('nvidia-llama-405b');
  });

  it('DRAFTING intent calls Groq versatile for markdown prose', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield '# Draft\n\nHere is the draft content.';
    });

    const { tokens } = await collectStream(streamChat(messages, 'DRAFTING'));

    expect(tokens).toContain('# Draft\n\nHere is the draft content.');
    expect(streamChatGroq).toHaveBeenCalledWith(
      expect.any(Array),
      'llama-3.3-70b-versatile'
    );
  });
});

// ── Privacy: memory file missing ─────────────────────────────────────────────

describe('privacy — memory file handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroq).mockImplementation(async function* () { yield 'response'; });
  });

  it('continues without throwing when user-memory.md is absent', async () => {
    vi.mocked(readMemory).mockReturnValue(null);

    await expect(collectStream(streamChat(messages))).resolves.toBeDefined();
  });

  it('still generates a response when memory is absent', async () => {
    vi.mocked(readMemory).mockReturnValue(null);

    const { tokens } = await collectStream(streamChat(messages));

    expect(tokens).toContain('response');
  });
});

// ── summarize ─────────────────────────────────────────────────────────────────

describe('summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue();
  });

  it('uses Groq summarize when available', async () => {
    vi.mocked(summarizeGroq).mockResolvedValue('Summary text');

    const result = await summarize('Please summarize this.');

    expect(result).toBe('Summary text');
    expect(summarizeGroq).toHaveBeenCalled();
  });

  it('falls back to Gemini when Groq summary fails with rate limit', async () => {
    vi.mocked(summarizeGroq).mockRejectedValue(new Error('429 rate limit'));
    vi.mocked(summarizeGemini).mockResolvedValue('Gemini summary');

    const result = await summarize('Summarize this.');

    expect(result).toBe('Gemini summary');
  });

  it('throws SUMMARIZE_QUOTA_EXCEEDED when all providers are at limit', async () => {
    vi.mocked(getUsageCount).mockReturnValue(999999);

    await expect(summarize('prompt')).rejects.toThrow('SUMMARIZE_QUOTA_EXCEEDED');
  });
});
