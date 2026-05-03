import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage', () => ({
  getUsageCount: vi.fn(),
  incrementUsage: vi.fn(),
}));

vi.mock('./groqService', () => ({
  streamChatGroqChat: vi.fn(),
  streamChatGroqChatWithTools: vi.fn(),
  summarizeGroq: vi.fn(),
  isGroqAvailable: vi.fn(),
}));

vi.mock('./geminiService', () => ({
  streamChatGemini: vi.fn(),
  streamChatGeminiWithSearch: vi.fn(),
  streamChatGeminiWithTools: vi.fn(),
  summarizeGemini: vi.fn(),
  isGeminiAvailable: vi.fn(),
}));

vi.mock('./openrouterService', () => ({
  streamChatOpenRouter: vi.fn(),
  streamChatOpenRouterWithTools: vi.fn(),
  summarizeOpenRouter: vi.fn(),
  isOpenRouterAvailable: vi.fn(),
}));

vi.mock('./nvidiaService', () => ({
  streamChatNvidia: vi.fn(),
  streamChatNvidiaWithTools: vi.fn(),
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

import { streamChat, summarize, StreamResult, InternalNoteResult, RouterResult } from './aiRouter';
import { Intent } from '../types';
import { ChatMessage } from './groqService';
import { getUsageCount, incrementUsage } from '../storage';
import {
  streamChatGroqChat,
  streamChatGroqChatWithTools,
  isGroqAvailable,
} from './groqService';
import {
  streamChatGemini,
  streamChatGeminiWithTools,
  streamChatGeminiWithSearch,
  isGeminiAvailable,
  summarizeGemini,
} from './geminiService';
import {
  streamChatOpenRouter,
  streamChatOpenRouterWithTools,
  isOpenRouterAvailable,
} from './openrouterService';
import {
  streamChatNvidia,
  streamChatNvidiaWithTools,
  isNvidiaAvailable,
  summarizeNvidia,
} from './nvidiaService';
import { readMemory } from './memoryService';

async function collectRouter(gen: AsyncGenerator<RouterResult>) {
  const tokens: string[] = [];
  const notes: string[] = [];
  let model = '';
  for await (const r of gen) {
    if ('internalNote' in r) {
      notes.push(r.internalNote);
      model = r.model;
    } else if ('token' in r) {
      tokens.push(r.token);
      model = r.model;
    } else {
      // ToolCallResult — skip in these tests
      model = r.model;
    }
  }
  return { tokens, notes, model };
}

function setAllUnavailable() {
  vi.mocked(isNvidiaAvailable).mockReturnValue(false);
  vi.mocked(isGroqAvailable).mockReturnValue(false);
  vi.mocked(isGeminiAvailable).mockReturnValue(false);
  vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
}

describe('aiRouter v4.0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    vi.mocked(readMemory).mockReturnValue(null);
    setAllUnavailable();

    const emptyGen = async function* () {};
    vi.mocked(streamChatGemini).mockImplementation(emptyGen);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(emptyGen);
    vi.mocked(streamChatNvidia).mockImplementation(emptyGen);
    vi.mocked(streamChatGroqChat).mockImplementation(emptyGen);
    vi.mocked(streamChatOpenRouter).mockImplementation(emptyGen);

    // Delegate *WithTools variants to plain variants so existing tests continue to work
    vi.mocked(streamChatGeminiWithTools).mockImplementation((msgs, model) => (streamChatGemini as Function)(msgs, model));
    vi.mocked(streamChatNvidiaWithTools).mockImplementation((msgs, model) => (streamChatNvidia as Function)(msgs, model));
    vi.mocked(streamChatGroqChatWithTools).mockImplementation((msgs, model) => (streamChatGroqChat as Function)(msgs, model));
    vi.mocked(streamChatOpenRouterWithTools).mockImplementation((msgs, model) => (streamChatOpenRouter as Function)(msgs, model));
  });

  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

  describe('Intent-Based Specialist Routing (Baseline)', () => {
    it('WEB_SEARCH routes to Gemini with search tool (Tier 1)', async () => {
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(streamChatGeminiWithSearch).mockImplementationOnce(async function* () {
          yield 'Search result';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.WEB_SEARCH));
        expect(tokens).toEqual(['Search result']);
        expect(model).toBe('Gemini: 2.5 Flash');
        expect(streamChatGeminiWithSearch).toHaveBeenCalledWith(expect.anything(), 'gemini-2.5-flash', { google_search: {} });
    });

    it('CODING routes to NVIDIA 405B (Tier 1)', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
          yield 'const x = 1;';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.CODING));
        expect(tokens).toEqual(['const x = 1;']);
        expect(model).toBe('NVIDIA: Llama 3.3 70B');
        expect(streamChatNvidia).toHaveBeenCalledWith(expect.anything(), 'meta/llama-3.3-70b-instruct');
    });

    it('DEBUGGING routes to Groq 70B (Tier 1)', async () => {
        vi.mocked(isGroqAvailable).mockReturnValue(true);
        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
          yield 'Bug fixed';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.DEBUGGING));
        expect(tokens).toEqual(['Bug fixed']);
        expect(model).toBe('Groq: Llama 3.3 70B');
        expect(streamChatGroqChat).toHaveBeenCalledWith(expect.anything(), 'llama-3.3-70b-versatile');
    });

    it('TRANSLATING routes to OR GPT-oss-120b (Tier 1)', async () => {
        vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
        vi.mocked(streamChatOpenRouter).mockImplementationOnce(async function* () {
            yield 'Bonjour';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.TRANSLATING));
        expect(tokens).toEqual(['Bonjour']);
        expect(model).toBe('OR: GPT-oss-120b');
        expect(streamChatOpenRouter).toHaveBeenCalledWith(expect.anything(), 'openai/gpt-oss-120b:free');
    });

    it('SUMMARIZING routes to Gemini (Tier 1)', async () => {
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
            yield 'Summary';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.SUMMARIZING));
        expect(tokens).toEqual(['Summary']);
        expect(model).toBe('Gemini: 2.5 Flash');
    });

    it('IMAGE_ANALYSIS routes to Gemini with vision (Tier 1)', async () => {
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
            yield 'Image desc';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.IMAGE_ANALYSIS, true));
        expect(tokens).toEqual(['Image desc']);
        expect(model).toBe('Gemini: 2.5 Flash');
    });
  });

  describe('Multi-Tier Fallback Matrix (v4.0 Resilience)', () => {
    it('WEB_SEARCH falls back through all tiers correctly', async () => {
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(isOpenRouterAvailable).mockReturnValue(true);

        vi.mocked(streamChatGeminiWithSearch).mockImplementationOnce(async function* () {
          throw Object.assign(new Error('429'), { status: 429 });
        });
        vi.mocked(streamChatGeminiWithSearch).mockImplementationOnce(async function* () {
            throw Object.assign(new Error('429'), { status: 429 });
        });
        vi.mocked(streamChatOpenRouter).mockImplementationOnce(async function* () {
          yield 'Tier 3 response';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.WEB_SEARCH));
        expect(tokens).toEqual(['Tier 3 response']);
        expect(model).toBe('OR: GPT-oss-120b (Fallback)');

        expect(streamChatGeminiWithSearch).toHaveBeenNthCalledWith(1, expect.anything(), 'gemini-2.5-flash', { google_search: {} });
        expect(streamChatGeminiWithSearch).toHaveBeenNthCalledWith(2, expect.anything(), 'gemini-2.5-pro', { google_search: {} });
        expect(streamChatOpenRouter).toHaveBeenCalledWith(expect.anything(), 'openai/gpt-oss-120b:free');
    });

    it('CODING falls back from NVIDIA to Groq', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(isGroqAvailable).mockReturnValue(true);

        vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
            throw Object.assign(new Error('429'), { status: 429 });
        });
        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
            yield 'Groq coding';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.CODING));
        expect(tokens).toEqual(['Groq coding']);
        expect(model).toBe('Groq: Llama 3.3 70B (Fallback)');
    });

    it('DEBUGGING falls back to OR Laguna M.1 (Tier 3)', async () => {
        vi.mocked(isGroqAvailable).mockReturnValue(true);
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(isOpenRouterAvailable).mockReturnValue(true);

        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () { throw Object.assign(new Error('fail'), { status: 429 }); });
        vi.mocked(streamChatGemini).mockImplementationOnce(async function* () { throw Object.assign(new Error('fail'), { status: 429 }); });
        vi.mocked(streamChatOpenRouter).mockImplementationOnce(async function* () { yield 'Qwen fixed it'; });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.DEBUGGING));
        expect(tokens).toEqual(['Qwen fixed it']);
        expect(model).toBe('OR: Laguna M.1 (Fallback)');
        expect(streamChatOpenRouter).toHaveBeenCalledWith(expect.anything(), 'poolside/laguna-m.1:free');
    });

    it('falls back past a non-retryable error (e.g. 400) to the next tier', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(isGroqAvailable).mockReturnValue(true);

        vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
          throw Object.assign(new Error('Bad Request'), { status: 400 });
        });
        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
          yield 'Groq fallback response';
        });

        const { tokens, model } = await collectRouter(streamChat(messages, Intent.CODING));
        expect(tokens).toEqual(['Groq fallback response']);
        expect(model).toBe('Groq: Llama 3.3 70B (Fallback)');
        expect(streamChatNvidia).toHaveBeenCalledTimes(1);
        expect(streamChatGroqChat).toHaveBeenCalledTimes(1);
    });

    it('throws the last error when all tiers fail', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(isGroqAvailable).mockReturnValue(true);
        vi.mocked(isGeminiAvailable).mockReturnValue(true);

        vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () { throw Object.assign(new Error('First fail'), { status: 400 }); });
        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () { throw Object.assign(new Error('Second fail'), { status: 400 }); });
        vi.mocked(streamChatGemini).mockImplementationOnce(async function* () { throw Object.assign(new Error('Final fail'), { status: 400 }); });

        await expect(async () => {
          for await (const _ of streamChat(messages, Intent.CODING)) {}
        }).rejects.toThrow('Final fail');
    });
  });

  describe('Functional Logic (Baseline Restoration)', () => {
    it('trims context for Groq tiers (DEBUGGING)', async () => {
        vi.mocked(isGroqAvailable).mockReturnValue(true);
        vi.mocked(streamChatGroqChat).mockImplementation(async function* () { yield 'ok'; });

        const longMessages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
          role: 'user', content: `msg ${i}`
        }));

        await collectRouter(streamChat(longMessages, Intent.DEBUGGING));
        const calledWith = vi.mocked(streamChatGroqChat).mock.calls[0][0];
        expect(calledWith.length).toBe(12);
    });

    it('prepends memory context when available', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(readMemory).mockReturnValue('User fact: Likes Taipei');
        vi.mocked(streamChatNvidia).mockImplementation(async function* () { yield 'ok'; });

        await collectRouter(streamChat(messages, Intent.CODING));
        const calledWith = vi.mocked(streamChatNvidia).mock.calls[0][0];
        expect(calledWith[0].content).toContain('User Memory Context');
        expect(calledWith[0].content).toContain('Likes Taipei');
    });

    it('skips memory injection when injectMemory=false', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(readMemory).mockReturnValue('Secret info');
        vi.mocked(streamChatNvidia).mockImplementation(async function* () { yield 'ok'; });

        await collectRouter(streamChat(messages, Intent.CODING, false, false));
        const calledWith = vi.mocked(streamChatNvidia).mock.calls[0][0];
        expect(calledWith[0].content).not.toContain('User Memory Context');
        expect(readMemory).not.toHaveBeenCalled();
    });

    it('increments usage only for the successful model in the chain', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(isGroqAvailable).mockReturnValue(true);

        vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
            throw Object.assign(new Error('429'), { status: 429 });
        });
        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
            yield 'Success';
        });

        await collectRouter(streamChat(messages, Intent.CODING));
        expect(incrementUsage).not.toHaveBeenCalledWith('nvidia', expect.anything());
        expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
    });

    it('yields grounding notes from Gemini correctly', async () => {
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(streamChatGeminiWithSearch).mockImplementationOnce(async function* () {
            yield 'Answer';
            yield { groundingNotes: 'Source: Google' };
        });

        const { tokens, notes } = await collectRouter(streamChat(messages, Intent.WEB_SEARCH));
        expect(tokens).toEqual(['Answer']);
        expect(notes).toEqual(['Source: Google']);
    });

    it('throws QUOTA_EXCEEDED when all tiers are at limit', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(getUsageCount).mockReturnValue(9999); // Above limit

        await expect(async () => {
            for await (const _ of streamChat(messages, Intent.CODING)) {}
        }).rejects.toThrow('QUOTA_EXCEEDED');
    });

    it('skips providers without API keys', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(false);
        vi.mocked(isGroqAvailable).mockReturnValue(true);
        vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () { yield 'ok'; });

        const { model } = await collectRouter(streamChat(messages, Intent.CODING));
        expect(model).toBe('Groq: Llama 3.3 70B (Fallback)');
        expect(streamChatNvidia).not.toHaveBeenCalled();
    });
  });

  describe('summarize (Baseline Restoration)', () => {
    it('uses the v4.0 fallback chain for summarization', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(isGeminiAvailable).mockReturnValue(true);

        vi.mocked(summarizeNvidia).mockRejectedValueOnce(new Error('fail'));
        vi.mocked(summarizeGemini).mockResolvedValueOnce('Gemini summary');

        const result = await summarize('text');
        expect(result).toBe('Gemini summary');
        expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
    });

    it('throws SUMMARIZE_QUOTA_EXCEEDED when all fail', async () => {
        setAllUnavailable();
        await expect(summarize('test')).rejects.toThrow('SUMMARIZE_QUOTA_EXCEEDED');
    });

    it('skips providers at limit during summarization', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(getUsageCount).mockImplementation((key) => key === 'nvidia' ? 9999 : 0);
        vi.mocked(isGeminiAvailable).mockReturnValue(true);
        vi.mocked(summarizeGemini).mockResolvedValueOnce('ok');

        const result = await summarize('test');
        expect(result).toBe('ok');
        expect(summarizeNvidia).not.toHaveBeenCalled();
    });
  });
});

// ── Per-intent fallback chains (v4) ──────────────────────────────────────────
// Tests covering T2/T3 fallback paths not exercised by the matrix tests above.

describe('streamChat – Per-intent fallback chains (v4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue(undefined as unknown as void);
    vi.mocked(readMemory).mockReturnValue(null);
    setAllUnavailable();

    const emptyGen = async function* () {};
    vi.mocked(streamChatGemini).mockImplementation(emptyGen);
    vi.mocked(streamChatGeminiWithSearch).mockImplementation(emptyGen);
    vi.mocked(streamChatNvidia).mockImplementation(emptyGen);
    vi.mocked(streamChatGroqChat).mockImplementation(emptyGen);
    vi.mocked(streamChatOpenRouter).mockImplementation(emptyGen);

    // Delegate *WithTools variants to plain variants so existing tests continue to work
    vi.mocked(streamChatGeminiWithTools).mockImplementation((msgs, model) => (streamChatGemini as Function)(msgs, model));
    vi.mocked(streamChatNvidiaWithTools).mockImplementation((msgs, model) => (streamChatNvidia as Function)(msgs, model));
    vi.mocked(streamChatGroqChatWithTools).mockImplementation((msgs, model) => (streamChatGroqChat as Function)(msgs, model));
    vi.mocked(streamChatOpenRouterWithTools).mockImplementation((msgs, model) => (streamChatOpenRouter as Function)(msgs, model));
  });

  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

  // ── CODING: nvidia(T1) → groq-chat(T2) → gemini-pro(T3) ─────────────────

  it('CODING T3: falls back to gemini-pro when nvidia and groq both fail', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('nvidia down'), { status: 429 });
    });
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('groq down'), { status: 503 });
    });
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      yield 'gemini T3 code';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.CODING));

    expect(model).toBe('Gemini: 2.5 Pro (Fallback)');
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
    expect(streamChatGemini).toHaveBeenCalledWith(expect.anything(), 'gemini-2.5-pro');
  });

  // ── DRAFTING: groq-chat(T1) → gemini-flash(T2) → nvidia-70b(T3) ─────────

  it('DRAFTING T2: falls back to gemini-flash when groq fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('groq down'), { status: 429 });
    });
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      yield 'gemini draft';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DRAFTING));

    expect(model).toBe('Gemini: 2.5 Flash (Fallback)');
    expect(streamChatGemini).toHaveBeenCalledWith(expect.anything(), 'gemini-2.5-flash');
  });

  it('DRAFTING T3: falls back to nvidia-70b when groq and gemini both fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('groq down'), { status: 429 });
    });
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('gemini down'), { status: 503 });
    });
    vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
      yield 'nvidia draft fallback';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.DRAFTING));

    expect(model).toBe('NVIDIA: Llama 3.1 70B (Fallback)');
    expect(streamChatNvidia).toHaveBeenCalledWith(expect.anything(), 'meta/llama-3.1-70b-instruct');
  });

  // ── SUMMARIZING: gemini-flash(T1) → groq-chat(T2) → openrouter-llama-3.2-3b(T3) ──

  it('SUMMARIZING T2: falls back to groq when gemini fails', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('gemini down'), { status: 429 });
    });
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      yield 'groq summary';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.SUMMARIZING));

    expect(model).toBe('Groq: Llama 3.3 70B (Fallback)');
    expect(streamChatGroqChat).toHaveBeenCalledWith(expect.anything(), 'llama-3.3-70b-versatile');
  });

  it('SUMMARIZING T3: falls back to OR Llama 3.2 3B when gemini and groq both fail', async () => {
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('fail'), { status: 429 });
    });
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('fail'), { status: 503 });
    });
    vi.mocked(streamChatOpenRouter).mockImplementationOnce(async function* () {
      yield 'mistral small summary';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.SUMMARIZING));

    expect(model).toBe('OR: Llama 3.2 3B (Fallback)');
    expect(streamChatOpenRouter).toHaveBeenCalledWith(expect.anything(), 'meta-llama/llama-3.2-3b-instruct:free');
  });

  // ── TRANSLATING: openrouter-gpt-oss-120b(T1) → gemini-pro(T2) → groq-chat(T3) ──

  it('TRANSLATING T2: falls back to gemini-pro when openrouter fails', async () => {
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatOpenRouter).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('openrouter down'), { status: 429 });
    });
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      yield 'gemini translation';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.TRANSLATING));

    expect(model).toBe('Gemini: 2.5 Pro (Fallback)');
    expect(streamChatGemini).toHaveBeenCalledWith(expect.anything(), 'gemini-2.5-pro');
  });

  it('TRANSLATING T3: falls back to groq when openrouter and gemini both fail', async () => {
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatOpenRouter).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('fail'), { status: 429 });
    });
    vi.mocked(streamChatGemini).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('fail'), { status: 503 });
    });
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      yield 'groq translation';
    });

    const { model } = await collectRouter(streamChat(messages, Intent.TRANSLATING));

    expect(model).toBe('Groq: Llama 3.3 70B (Fallback)');
    expect(streamChatGroqChat).toHaveBeenCalledWith(expect.anything(), 'llama-3.3-70b-versatile');
  });

  // ── Usage invariant ───────────────────────────────────────────────────────

  it('usage is incremented only for the tier that succeeds, not for failed tiers', async () => {
    vi.mocked(isNvidiaAvailable).mockReturnValue(true);
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatNvidia).mockImplementationOnce(async function* () {
      throw Object.assign(new Error('nvidia fail'), { status: 429 });
    });
    vi.mocked(streamChatGroqChat).mockImplementationOnce(async function* () {
      yield 'groq success';
    });

    await collectRouter(streamChat(messages, Intent.CODING));

    expect(incrementUsage).not.toHaveBeenCalledWith('nvidia', expect.any(String));
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
    expect(incrementUsage).toHaveBeenCalledTimes(1);
  });
});
