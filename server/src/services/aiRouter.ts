import { getUsageCount, incrementUsage } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { streamChatGroq, summarizeGroq, isGroqAvailable } from './groqService';
import { streamChatGemini, summarizeGemini, isGeminiAvailable } from './geminiService';
import { streamChatOpenRouter, summarizeOpenRouter, isOpenRouterAvailable } from './openrouterService';
import { ChatMessage } from './groqService';

const GROQ_CHAT_LIMIT = Number(process.env.GROQ_CHAT_DAILY_LIMIT ?? 14400);
const GROQ_SUMMARY_LIMIT = Number(process.env.GROQ_SUMMARY_DAILY_LIMIT ?? 1000);
const GEMINI_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 1500);
const OPENROUTER_LIMIT = Number(process.env.OPENROUTER_DAILY_LIMIT ?? 200);

function isProviderAvailable(name: string): boolean {
  switch (name) {
    case 'groq-chat':
    case 'groq-summary':
      return isGroqAvailable();
    case 'gemini':
      return isGeminiAvailable();
    case 'openrouter':
      return isOpenRouterAvailable();
    default:
      return false;
  }
}

function isRateLimitError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('quota');
}

export interface StreamResult {
  token: string;
  model: string;
}

export async function* streamChat(
  messages: ChatMessage[]
): AsyncGenerator<StreamResult> {
  const today = getToday();

  const providers: Array<{
    name: string;
    key: string;
    limit: number;
    stream: (msgs: ChatMessage[]) => AsyncGenerator<string>;
  }> = [
    { name: 'groq-chat', key: 'groq-chat', limit: GROQ_CHAT_LIMIT, stream: streamChatGroq },
    { name: 'gemini', key: 'gemini', limit: GEMINI_LIMIT, stream: streamChatGemini },
    { name: 'openrouter', key: 'openrouter', limit: OPENROUTER_LIMIT, stream: streamChatOpenRouter },
  ];

  for (const provider of providers) {
    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) {
      logger.error(`Provider ${provider.name} daily limit reached (${usage}/${provider.limit})`);
      continue;
    }

    if (!isProviderAvailable(provider.name)) {
      logger.error(`Provider ${provider.name} is not available (no API key)`);
      continue;
    }

    try {
      let hasOutput = false;

      for await (const token of provider.stream(messages)) {
        // MOVE IT HERE:
        if (!hasOutput) {
          incrementUsage(provider.key, today);
          hasOutput = true;
        }
        yield { token, model: provider.name };
      }

      if (hasOutput) return;
      logger.error(`Provider ${provider.name} returned no tokens`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`Provider ${provider.name} failed: ${errMsg}`);
      logger.error(`Provider ${provider.name} failed:`, err);
      // Always try the next provider regardless of error type
    }
  }

  throw new Error('QUOTA_EXCEEDED');
}

export async function summarize(prompt: string): Promise<string> {
  const today = getToday();

  const providers: Array<{
    key: string;
    limit: number;
    fn: (p: string) => Promise<string>;
  }> = [
    { key: 'groq-summary', limit: GROQ_SUMMARY_LIMIT, fn: summarizeGroq },
    { key: 'gemini', limit: GEMINI_LIMIT, fn: summarizeGemini },
    { key: 'openrouter', limit: OPENROUTER_LIMIT, fn: summarizeOpenRouter },
  ];

  for (const provider of providers) {
    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) continue;

    try {
      incrementUsage(provider.key, today);
      const result = await provider.fn(prompt);
      if (result) return result;
    } catch (err) {
      logger.warn(`Summarize provider ${provider.key} failed: ${err}`);
      if (!isRateLimitError(err)) throw err;
    }
  }

  throw new Error('SUMMARIZE_QUOTA_EXCEEDED');
}
