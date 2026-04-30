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
  summarizeGemini: vi.fn(),
  isGeminiAvailable: vi.fn(),
}));

vi.mock('./openrouterService', () => ({
  streamChatOpenRouter: vi.fn(),
  summarizeOpenRouter: vi.fn(),
  isOpenRouterAvailable: vi.fn(),
}));

vi.mock('../utils/dateHelpers', () => ({
  getToday: vi.fn().mockReturnValue('2026-04-25'),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { streamChat, summarize } from './aiRouter';
import { ChatMessage } from './groqService';
import { getUsageCount, incrementUsage } from '../storage';
import { streamChatGroqCompound, streamChatGroqChat, isGroqAvailable, summarizeGroq } from './groqService';
import { streamChatGemini, isGeminiAvailable, summarizeGemini } from './geminiService';
import { streamChatOpenRouter, isOpenRouterAvailable, summarizeOpenRouter } from './openrouterService';

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

describe('streamChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue();
    vi.mocked(isGroqAvailable).mockReturnValue(false);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
  });

  it('throws QUOTA_EXCEEDED when no providers are available', async () => {
    await expect(async () => {
      for await (const _ of streamChat(messages)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('throws QUOTA_EXCEEDED when all providers are at limit', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(999999);

    await expect(async () => {
      for await (const _ of streamChat(messages)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('uses groq-compound as first priority', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqCompound).mockImplementation(async function* () {
      yield 'Hello';
      yield ' world';
    });

    const tokens: string[] = [];
    for await (const { token } of streamChat(messages)) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Hello', ' world']);
    expect(incrementUsage).toHaveBeenCalledWith('groq-compound', '2026-04-25');
    expect(streamChatGroqChat).not.toHaveBeenCalled();
  });

  it('falls back to groq-chat when compound fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(streamChatGroqCompound).mockImplementation(async function* () {
      throw new Error('compound failed');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      yield 'Chat fallback';
    });

    const tokens: string[] = [];
    for await (const { token } of streamChat(messages)) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Chat fallback']);
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
  });

  it('falls back to gemini when both groq providers fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);

    vi.mocked(streamChatGroqCompound).mockImplementation(async function* () {
      throw new Error('error');
    });
    vi.mocked(streamChatGroqChat).mockImplementation(async function* () {
      throw new Error('error');
    });
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Gemini response';
    });

    const tokens: string[] = [];
    for await (const { token } of streamChat(messages)) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Gemini response']);
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('skips non-vision providers when hasImages=true, uses gemini', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Vision response';
    });

    const tokens: string[] = [];
    for await (const { token } of streamChat(messages, true)) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Vision response']);
    expect(streamChatGroqCompound).not.toHaveBeenCalled();
    expect(streamChatGroqChat).not.toHaveBeenCalled();
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('throws QUOTA_EXCEEDED when all providers fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);

    for (const fn of [streamChatGroqCompound, streamChatGroqChat, streamChatGemini, streamChatOpenRouter]) {
      vi.mocked(fn).mockImplementation(async function* () {
        throw new Error('fail');
      });
    }

    await expect(async () => {
      for await (const _ of streamChat(messages)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('does not increment usage when provider is at limit', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(999999);

    await expect(async () => {
      for await (const _ of streamChat(messages)) {}
    }).rejects.toThrow('QUOTA_EXCEEDED');

    expect(incrementUsage).not.toHaveBeenCalled();
  });
});

describe('summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue();
    vi.mocked(isGroqAvailable).mockReturnValue(false);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
  });

  it('uses groq-chat and increments groq-chat usage (skips groq-compound)', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(summarizeGroq).mockResolvedValue('summarized text');

    const result = await summarize('test prompt');

    expect(result).toBe('summarized text');
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
    expect(incrementUsage).not.toHaveBeenCalledWith('groq-compound', expect.any(String));
  });

  it('falls back to gemini when groq-chat fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(summarizeGroq).mockRejectedValue(new Error('groq failed'));
    vi.mocked(summarizeGemini).mockResolvedValue('gemini summary');

    const result = await summarize('test prompt');
    expect(result).toBe('gemini summary');
    expect(incrementUsage).toHaveBeenCalledWith('gemini', '2026-04-25');
  });

  it('throws SUMMARIZE_QUOTA_EXCEEDED when no providers available', async () => {
    await expect(summarize('test')).rejects.toThrow('SUMMARIZE_QUOTA_EXCEEDED');
  });

  it('falls back to openrouter when groq and gemini fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(summarizeGroq).mockRejectedValue(new Error('groq failed'));
    vi.mocked(summarizeGemini).mockRejectedValue(new Error('gemini failed'));
    vi.mocked(summarizeOpenRouter).mockResolvedValue('openrouter summary');

    const result = await summarize('test');
    expect(result).toBe('openrouter summary');
  });
});
