import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage', () => ({
  getUsageCount: vi.fn(),
  incrementUsage: vi.fn(),
}));

vi.mock('./groqService', () => ({
  streamChatGroqCompound: vi.fn(),
  streamChatGroqChat: vi.fn(),
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
  streamChatOpenRouterTranslating: vi.fn(),
  summarizeOpenRouter: vi.fn(),
  isOpenRouterAvailable: vi.fn(),
}));

vi.mock('./nvidiaService', () => ({
  streamChatNvidia: vi.fn(),
  streamChatNvidiaCoding: vi.fn(),
  summarizeNvidia: vi.fn(),
  isNvidiaAvailable: vi.fn(),
}));

vi.mock('./memoryService', () => ({
  readMemory: vi.fn(),
}));

vi.mock('../utils/dateHelpers', () => ({
  getToday: vi.fn().mockReturnValue('2026-04-25'),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { streamChat, summarize, StreamResult, InternalNoteResult } from './aiRouter';
import { Intent } from '../types';
import { ChatMessage } from './groqService';
import { getUsageCount, incrementUsage } from '../storage';
import {
  streamChatGroqCompound,
  streamChatGroqChat,
  isGroqAvailable,
  summarizeGroq,
} from './groqService';
import {
  streamChatGemini,
  streamChatGeminiWithSearch,
  isGeminiAvailable,
  summarizeGemini,
} from './geminiService';
import {
  streamChatOpenRouter,
  streamChatOpenRouterTranslating,
  isOpenRouterAvailable,
  summarizeOpenRouter,
} from './openrouterService';
import {
  streamChatNvidia,
  streamChatNvidiaCoding,
  isNvidiaAvailable,
  summarizeNvidia,
} from './nvidiaService';
import { readMemory } from './memoryService';

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

async function collectRouter(gen: AsyncGenerator<StreamResult | InternalNoteResult>) {
  const tokens: string[] = [];
  const notes: string[] = [];
  let model = '';
  for await (const r of gen) {
    if ('internalNote' in r) {
      notes.push(r.internalNote);
      model = r.model;
    } else {
      tokens.push(r.token);
      model = r.model;
    }
  }
  return { tokens, notes, model };
}

// Default: all providers unavailable
function setAllUnavailable() {
  vi.mocked(isNvidiaAvailable).mockReturnValue(false);
  vi.mocked(isGroqAvailable).mockReturnValue(false);
  vi.mocked(isGeminiAvailable).mockReturnValue(false);
  vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
}

describe('streamChat – Intent routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    vi.mocked(readMemory).mockReturnValue(null);
    setAllUnavailable();
  });

  // ── WEB_SEARCH ──────────────────────────────────────────────────────────────

  it('WEB_SEARCH routes to Gemini with search tool', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield 'Search result';
    });

    const { tokens, model } = await collectRouter(
      streamChat(messages, Intent.WEB_SEARCH),
    );

    expect(tokens).toEqual(['Search result']);
    expect(model).toBe('gemini');
    expect(streamChatGeminiWithSearch).toHaveBeenCalled();
    expect(streamChatGemini).not.toHaveBeenCalled();
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('WEB_SEARCH yields InternalNoteResult for grounding notes', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield 'Answer text';
      yield { groundingNotes: 'Queries: test\nSources:\n- Example: https://example.com' };
    });

    const { tokens, notes, model } = await collectRouter(
      streamChat(messages, Intent.WEB_SEARCH),
    );

    expect(tokens).toEqual(['Answer text']);
    expect(notes).toEqual(['Queries: test\nSources:\n- Example: https://example.com']);
    expect(model).toBe('gemini');
    // Usage only incremented once (on first token, not on the internal note)
    expect(incrementUsage).toHaveBeenCalledTimes(1);
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('WEB_SEARCH does not call streamChatNvidiaCoding or groq services', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      yield 'ok';
    });

    await collectRouter(streamChat(messages, Intent.WEB_SEARCH));

    expect(streamChatNvidiaCoding).not.toHaveBeenCalled();
    expect(streamChatGroqChat).not.toHaveBeenCalled();
  });

  // ── CODING ───────────────────────────────────────────────────────────────────

  it('CODING routes to NVIDIA coding model', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      yield 'const x = 1;';
    });

    const { tokens, model } = await collectRouter(
      streamChat(messages, Intent.CODING),
    );

    expect(tokens).toEqual(['const x = 1;']);
    expect(model).toBe('nvidia');
    expect(streamChatNvidiaCoding).toHaveBeenCalled();
    expect(incrementUsage).toHaveBeenCalledWith('nvidia', '2026-04-25');
  });

  it('CODING is the default intent when none specified', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      yield 'default';
    });

    await collectRouter(streamChat(messages));

    expect(streamChatNvidiaCoding).toHaveBeenCalled();
  });

  // ── DEBUGGING ─────────────────────────────────────────────────────────────────

  it('DEBUGGING routes to Groq chat (llama-3.3-70b)', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'Fix: use strict equality';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DEBUGGING));

    expect(model).toBe('groq-chat');
    expect(streamChatGroqChat).toHaveBeenCalled();
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
  });

  it('DEBUGGING trims context to GROQ_MAX_CONTEXT_MESSAGES non-system messages', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'ok';
    });

    const longMessages: ChatMessage[] = [
      { role: 'system', content: 'System prompt' },
      ...Array.from({ length: 20 }, (_, i) => [
        { role: 'user' as const, content: `msg ${i}` },
        { role: 'assistant' as const, content: `reply ${i}` },
      ]).flat(),
    ];

    await collectRouter(streamChat(longMessages, Intent.DEBUGGING));

    const calledWith = vi.mocked(streamChatGroqChat).mock.calls[0][0];
    // System message is preserved; non-system are trimmed to last 12
    expect(calledWith[0]).toEqual({ role: 'system', content: 'System prompt' });
    expect(calledWith.filter((m) => m.role !== 'system').length).toBe(12);
  });

  // ── DRAFTING ─────────────────────────────────────────────────────────────────

  it('DRAFTING routes to Groq chat', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'Draft content';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DRAFTING));

    expect(model).toBe('groq-chat');
    expect(streamChatGroqChat).toHaveBeenCalled();
  });

  // ── TRANSLATING ───────────────────────────────────────────────────────────────

  it('TRANSLATING routes to OpenRouter mistral-large', async () => {
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(streamChatOpenRouterTranslating).mockImplementation(async function* () {
      yield 'Bonjour le monde';
    });

    const { tokens, model } = await collectRouter(
      streamChat(messages, Intent.TRANSLATING),
    );

    expect(tokens).toEqual(['Bonjour le monde']);
    expect(model).toBe('openrouter');
    expect(streamChatOpenRouterTranslating).toHaveBeenCalled();
    expect(incrementUsage).toHaveBeenCalledWith('openrouter', '2026-04-25');
  });

  // ── SUMMARIZING ───────────────────────────────────────────────────────────────

  it('SUMMARIZING routes to Gemini (no search tool)', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Summary here';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.SUMMARIZING));

    expect(model).toBe('gemini');
    expect(streamChatGemini).toHaveBeenCalled();
    expect(streamChatGeminiWithSearch).not.toHaveBeenCalled();
  });

  // ── IMAGE_ANALYSIS ────────────────────────────────────────────────────────────

  it('IMAGE_ANALYSIS routes to Gemini with vision', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Image description';
    });

    const { model } = await collectRouter(
      streamChat(messages, Intent.IMAGE_ANALYSIS, true),
    );

    expect(model).toBe('gemini');
    expect(streamChatGemini).toHaveBeenCalled();
  });

  it('Forces IMAGE_ANALYSIS specialist when hasImages=true and intent lacks vision', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Vision response';
    });

    const { model } = await collectRouter(
      streamChat(messages, Intent.CODING, true),
    );

    expect(model).toBe('gemini');
    expect(streamChatNvidiaCoding).not.toHaveBeenCalled();
    expect(streamChatGemini).toHaveBeenCalled();
  });
});

describe('streamChat – Fallback behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    vi.mocked(readMemory).mockReturnValue(null);
    setAllUnavailable();
  });

  it('falls back to nvidia when CODING specialist (nvidia) at daily limit', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockImplementation((key) => (key === 'nvidia' ? 999999 : 0));
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Gemini fallback';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.CODING));

    expect(model).toBe('gemini');
    expect(streamChatNvidiaCoding).not.toHaveBeenCalled();
    expect(streamChatGemini).toHaveBeenCalled();
  });

  it('falls back to Gemini when NVIDIA specialist throws a 429', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      throw Object.assign(new Error('rate limit'), { status: 429 });
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Gemini fallback';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.CODING));

    expect(model).toBe('gemini');
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('falls back through full CODING chain (nvidia→groq-chat→gemini) then throws QUOTA_EXCEEDED', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);

    for (const fn of [streamChatNvidiaCoding, streamChatGroqChat, streamChatGemini]) {
      vi.mocked(fn).mockImplementation(async function* () {
        throw new Error('fail');
      });
    }

    await expect(async () => {
      for await (const _ of streamChat(messages, Intent.CODING)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('skips specialist in fallback chain (no double-attempt)', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('groq fail');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'gemini fallback';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DEBUGGING));

    expect(model).toBe('gemini');
    // streamChatGroqChat called exactly once (specialist attempt only)
    expect(streamChatGroqChat).toHaveBeenCalledTimes(1);
  });

  it('throws QUOTA_EXCEEDED when all providers are unavailable', async () => {
    await expect(async () => {
      for await (const _ of streamChat(messages, Intent.CODING)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('throws QUOTA_EXCEEDED when all providers are at daily limit', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(999999);

    await expect(async () => {
      for await (const _ of streamChat(messages, Intent.CODING)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('does not increment usage when provider is at limit', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(999999);

    await expect(async () => {
      for await (const _ of streamChat(messages, Intent.CODING)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');

    expect(incrementUsage).not.toHaveBeenCalled();
  });
});

describe('streamChat – Context trimming for Groq', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    vi.mocked(readMemory).mockReturnValue(null);
    setAllUnavailable();
  });

  it('trims context for DRAFTING (groq-chat) to 12 non-system messages', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'draft';
    });

    const longMessages: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
    }));

    await collectRouter(streamChat(longMessages, Intent.DRAFTING));

    const calledWith = vi.mocked(streamChatGroqChat).mock.calls[0][0];
    expect(calledWith.length).toBe(12);
  });

  it('does not trim context for CODING (nvidia)', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      yield 'code';
    });

    const longMessages: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
    }));

    await collectRouter(streamChat(longMessages, Intent.CODING));

    const calledWith = vi.mocked(streamChatNvidiaCoding).mock.calls[0][0];
    expect(calledWith.length).toBe(30);
  });
});

// ── Memory injection (v3) ─────────────────────────────────────────────────────

describe('streamChat – Memory injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    setAllUnavailable();
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      yield 'response';
    });
  });

  it('prepends system message with memory context when memory exists', async () => {
    vi.mocked(readMemory).mockReturnValue('## Identity\n- Name: Alice');

    await collectRouter(streamChat(messages));

    const callArgs = vi.mocked(streamChatNvidiaCoding).mock.calls[0][0];
    expect(callArgs[0].role).toBe('system');
    expect(callArgs[0].content).toContain('User Memory Context');
    expect(callArgs[0].content).toContain('Name: Alice');
  });

  it('does not prepend system message when memory file is absent', async () => {
    vi.mocked(readMemory).mockReturnValue(null);

    await collectRouter(streamChat(messages));

    const callArgs = vi.mocked(streamChatNvidiaCoding).mock.calls[0][0];
    expect(callArgs[0].role).toBe('user');
  });

  it('skips memory injection when injectMemory=false', async () => {
    vi.mocked(readMemory).mockReturnValue('## Identity\n- Name: Alice');

    await collectRouter(streamChat(messages, Intent.CODING, false, false));

    expect(readMemory).not.toHaveBeenCalled();
    const callArgs = vi.mocked(streamChatNvidiaCoding).mock.calls[0][0];
    expect(callArgs[0].role).toBe('user');
  });

  it('continues without throwing when memory file is absent (privacy guard)', async () => {
    vi.mocked(readMemory).mockReturnValue(null);
    await expect(collectRouter(streamChat(messages))).resolves.toBeDefined();
  });
});

// ── summarize ─────────────────────────────────────────────────────────────────

describe('summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    setAllUnavailable();
  });

  it('uses nvidia first for summarization', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(summarizeNvidia).mockResolvedValue('nvidia summary');

    const result = await summarize('test prompt');

    expect(result).toBe('nvidia summary');
    expect(incrementUsage).toHaveBeenCalledWith('nvidia', '2026-04-25');
    expect(incrementUsage).not.toHaveBeenCalledWith('groq-chat', expect.any(String));
  });

  it('falls back to gemini when nvidia fails', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(summarizeNvidia).mockRejectedValue(new Error('nvidia failed'));
    vi.mocked(summarizeGemini).mockResolvedValue('gemini summary');

    const result = await summarize('test prompt');
    expect(result).toBe('gemini summary');
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('falls back to groq-chat when nvidia and gemini fail', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(summarizeNvidia).mockRejectedValue(new Error('nvidia failed'));
    vi.mocked(summarizeGemini).mockRejectedValue(new Error('gemini failed'));
    vi.mocked(summarizeGroq).mockResolvedValue('groq summary');

    const result = await summarize('test prompt');
    expect(result).toBe('groq summary');
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
    expect(incrementUsage).not.toHaveBeenCalledWith('groq-compound', expect.any(String));
  });

  it('throws SUMMARIZE_QUOTA_EXCEEDED when no providers available', async () => {
    await expect(summarize('test')).rejects.toThrow('SUMMARIZE_QUOTA_EXCEEDED');
  });

  it('falls back to openrouter when all others fail', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(summarizeNvidia).mockRejectedValue(new Error('nvidia failed'));
    vi.mocked(summarizeGemini).mockRejectedValue(new Error('gemini failed'));
    vi.mocked(summarizeGroq).mockRejectedValue(new Error('groq failed'));
    vi.mocked(summarizeOpenRouter).mockResolvedValue('openrouter summary');

    const result = await summarize('test');
    expect(result).toBe('openrouter summary');
  });

  it('skips groq-compound for summarization (preserves chat budget)', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(summarizeGroq).mockResolvedValue('groq summary');
    vi.mocked(getUsageCount).mockImplementation((key) =>
      key === 'groq-compound' ? 0 : 999999,
    );

    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);

    await expect(summarize('test')).rejects.toThrow('SUMMARIZE_QUOTA_EXCEEDED');
    expect(incrementUsage).not.toHaveBeenCalledWith('groq-compound', expect.any(String));
  });
});

// ── Per-intent fallback chains (v4) ──────────────────────────────────────────

describe('streamChat – Per-intent fallback chains (v4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    vi.mocked(readMemory).mockReturnValue(null);
    setAllUnavailable();
  });

  // ── CODING: nvidia(T1) → groq-chat(T2) → gemini(T3) ─────────────────────

  it('CODING T2: falls back to groq-chat when nvidia specialist throws 429', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      throw Object.assign(new Error('rate limit'), { status: 429 });
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'groq fallback code';
    });

    const { model, tokens } = await collectRouter(streamChat(messages, Intent.CODING));

    expect(tokens).toEqual(['groq fallback code']);
    expect(model).toBe('groq-chat');
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
    expect(streamChatNvidiaCoding).toHaveBeenCalledTimes(1);
  });

  it('CODING T3: falls back to gemini when nvidia and groq-chat both fail', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      throw new Error('nvidia down');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('groq down');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'gemini T3 code';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.CODING));

    expect(model).toBe('gemini');
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('CODING: openrouter is NOT in the per-intent fallback chain', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    for (const fn of [streamChatNvidiaCoding, streamChatGroqChat, streamChatGemini]) {
      vi.mocked(fn).mockImplementation(async function* () {
        throw new Error('fail');
      });
    }
    vi.mocked(streamChatOpenRouter).mockImplementation(async function* () {
      yield 'should not reach here';
    });

    await expect(async () => {
      for await (const _ of streamChat(messages, Intent.CODING)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');

    expect(streamChatOpenRouter).not.toHaveBeenCalled();
  });

  // ── DEBUGGING: groq-chat(T1) → gemini(T2) → openrouter(T3) ─────────────

  it('DEBUGGING T2: falls back to gemini when groq-chat specialist fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('groq down');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'gemini debug';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DEBUGGING));

    expect(model).toBe('gemini');
    expect(streamChatGroqChat).toHaveBeenCalledTimes(1);
  });

  it('DEBUGGING T3: falls back to openrouter when groq-chat and gemini both fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('groq down');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('gemini down');
    });
    vi.mocked(streamChatOpenRouter).mockImplementation(async function* () {
      yield 'openrouter debug';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DEBUGGING));

    expect(model).toBe('openrouter');
    expect(incrementUsage).toHaveBeenCalledWith('openrouter', '2026-04-25');
  });

  // ── WEB_SEARCH: gemini-search(T1) → gemini(T2) → openrouter(T3) ─────────

  it('WEB_SEARCH T2: falls back to gemini without search tool when search specialist fails', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      throw new Error('search unavailable');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'gemini plain answer';
    });

    const { model, tokens } = await collectRouter(streamChat(messages, Intent.WEB_SEARCH));

    expect(tokens).toEqual(['gemini plain answer']);
    expect(model).toBe('gemini');
    expect(streamChatGemini).toHaveBeenCalled();
    expect(streamChatGeminiWithSearch).toHaveBeenCalledTimes(1);
  });

  it('WEB_SEARCH T3: falls back to openrouter when both gemini variants fail', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(async function* () {
      throw new Error('fail');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('fail');
    });
    vi.mocked(streamChatOpenRouter).mockImplementation(async function* () {
      yield 'openrouter search fallback';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.WEB_SEARCH));

    expect(model).toBe('openrouter');
  });

  // ── DRAFTING: groq-chat(T1) → gemini(T2) → nvidia(T3) ──────────────────

  it('DRAFTING T2: falls back to gemini when groq-chat specialist fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('groq down');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'gemini draft';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DRAFTING));

    expect(model).toBe('gemini');
  });

  it('DRAFTING T3: falls back to nvidia when groq-chat and gemini both fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('groq down');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('gemini down');
    });
    vi.mocked(streamChatNvidia).mockImplementation(async function* () {
      yield 'nvidia draft fallback';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DRAFTING));

    expect(model).toBe('nvidia');
    expect(incrementUsage).toHaveBeenCalledWith('nvidia', '2026-04-25');
  });

  // ── SUMMARIZING: gemini(T1) → groq-chat(T2) → openrouter(T3) ───────────

  it('SUMMARIZING T2: falls back to groq-chat when gemini specialist fails', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('gemini down');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'groq summary';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.SUMMARIZING));

    expect(model).toBe('groq-chat');
  });

  it('SUMMARIZING T3: falls back to openrouter when gemini and groq-chat both fail', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('fail');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('fail');
    });
    vi.mocked(streamChatOpenRouter).mockImplementation(async function* () {
      yield 'openrouter summary';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.SUMMARIZING));

    expect(model).toBe('openrouter');
  });

  // ── TRANSLATING: openrouter-mistral(T1) → gemini(T2) → groq-chat(T3) ───

  it('TRANSLATING T2: falls back to gemini when openrouter-mistral specialist fails', async () => {
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatOpenRouterTranslating).mockImplementation(async function* () {
      throw new Error('openrouter down');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'gemini translation';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.TRANSLATING));

    expect(model).toBe('gemini');
    expect(streamChatOpenRouterTranslating).toHaveBeenCalledTimes(1);
  });

  it('TRANSLATING T3: falls back to groq-chat when openrouter and gemini both fail', async () => {
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatOpenRouterTranslating).mockImplementation(async function* () {
      throw new Error('fail');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('fail');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'groq translation';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.TRANSLATING));

    expect(model).toBe('groq-chat');
  });

  // ── Usage is only incremented for the model that actually responds ────────

  it('usage is incremented only for the model that succeeds, not for ones that fail', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidiaCoding).mockImplementation(async function* () {
      throw new Error('nvidia fail');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'groq success';
    });

    await collectRouter(streamChat(messages, Intent.CODING));

    expect(incrementUsage).not.toHaveBeenCalledWith('nvidia', expect.any(String));
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
    expect(incrementUsage).toHaveBeenCalledTimes(1);
  });
});
