import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat } from './aiRouter';
import { ChatMessage } from './groqService';

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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getUsageCount, incrementUsage } from '../storage';
import { streamChatGroq, isGroqAvailable } from './groqService';
import { streamChatGemini, isGeminiAvailable } from './geminiService';
import { streamChatOpenRouter, isOpenRouterAvailable } from './openrouterService';

describe('streamChat', () => {
  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUsageCount).mockReturnValue(0);
    vi.mocked(incrementUsage).mockReturnValue();
  });

  it('throws QUOTA_EXCEEDED when no providers are available', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(false);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);

    const generator = streamChat(messages);
    
    await expect(async () => {
      for await (const _ of generator) {
        // Should not yield any tokens
      }
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('throws QUOTA_EXCEEDED when all providers are at limit', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(999999); // Over limit

    const generator = streamChat(messages);
    
    await expect(async () => {
      for await (const _ of generator) {
        // Should not yield any tokens
      }
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('yields tokens from first available provider', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(false);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
    
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      yield 'Hello';
      yield ' world';
    });

    const tokens: string[] = [];
    const generator = streamChat(messages);
    
    for await (const { token } of generator) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Hello', ' world']);
    expect(incrementUsage).toHaveBeenCalledWith('groq-chat', '2026-04-25');
  });

  it('falls back to next provider when first fails', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(false);
    
    // Groq fails
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      throw new Error('Groq error');
    });
    
    // Gemini works
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      yield 'Fallback';
    });

    const tokens: string[] = [];
    const generator = streamChat(messages);
    
    for await (const { token } of generator) {
      tokens.push(token);
    }

    expect(tokens).toEqual(['Fallback']);
  });

  it('throws QUOTA_EXCEEDED when all providers fail', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(isGeminiAvailable).mockReturnValue(true);
    vi.mocked(isOpenRouterAvailable).mockReturnValue(true);
    
    vi.mocked(streamChatGroq).mockImplementation(async function* () {
      throw new Error('Groq error');
    });
    
    vi.mocked(streamChatGemini).mockImplementation(async function* () {
      throw new Error('Gemini error');
    });
    
    vi.mocked(streamChatOpenRouter).mockImplementation(async function* () {
      throw new Error('OpenRouter error');
    });

    const generator = streamChat(messages);
    
    await expect(async () => {
      for await (const _ of generator) {
        // Should not yield any tokens
      }
    }).rejects.toThrow('QUOTA_EXCEEDED');
  });

  it('does not increment usage when provider is at limit', async () => {
    vi.mocked(isGroqAvailable).mockReturnValue(true);
    vi.mocked(getUsageCount).mockReturnValue(14400); // At limit

    const generator = streamChat(messages);
    
    await expect(async () => {
      for await (const _ of generator) {
        // Should not yield any tokens
      }
    }).rejects.toThrow('QUOTA_EXCEEDED');

    // Should not have called incrementUsage for groq since it was at limit
    expect(incrementUsage).not.toHaveBeenCalled();
  });
});