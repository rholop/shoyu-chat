import { getUsageCount, incrementUsage } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import {
  streamChatGroqCompound,
  streamChatGroqChat,
  summarizeGroq,
  isGroqAvailable,
  ChatMessage,
} from './groqService';
import { streamChatGemini, summarizeGemini, isGeminiAvailable } from './geminiService';
import { streamChatOpenRouter, summarizeOpenRouter, isOpenRouterAvailable } from './openrouterService';

const GROQ_COMPOUND_LIMIT = Number(process.env.GROQ_COMPOUND_DAILY_LIMIT ?? 250);
const GROQ_CHAT_LIMIT = Number(process.env.GROQ_CHAT_DAILY_LIMIT ?? 1000);
const GEMINI_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 1500);
const OPENROUTER_LIMIT = Number(process.env.OPENROUTER_DAILY_LIMIT ?? 200);

function isProviderKeyAvailable(key: string): boolean {
  if (key === 'groq-compound' || key === 'groq-chat') return isGroqAvailable();
  if (key === 'gemini') return isGeminiAvailable();
  if (key === 'openrouter') return isOpenRouterAvailable();
  return false;
}

export interface StreamResult {
  token: string;
  model: string;
}

export async function* streamChat(
  messages: ChatMessage[],
  hasImages = false,
): AsyncGenerator<StreamResult> {
  const today = getToday();

  const providers: Array<{
    key: string;
    limit: number;
    vision: boolean;
    stream: (msgs: ChatMessage[]) => AsyncGenerator<string>;
  }> = [
    { key: 'groq-compound', limit: GROQ_COMPOUND_LIMIT, vision: false, stream: streamChatGroqCompound },
    { key: 'groq-chat',     limit: GROQ_CHAT_LIMIT,     vision: false, stream: streamChatGroqChat },
    { key: 'gemini',        limit: GEMINI_LIMIT,         vision: true,  stream: streamChatGemini },
    { key: 'openrouter',    limit: OPENROUTER_LIMIT,     vision: false, stream: streamChatOpenRouter },
  ];

  for (const provider of providers) {
    if (hasImages && !provider.vision) continue;

    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) {
      logger.warn(`Provider ${provider.key} daily limit reached (${usage}/${provider.limit})`);
      continue;
    }

    if (!isProviderKeyAvailable(provider.key)) {
      logger.warn(`Provider ${provider.key} not available (no API key)`);
      continue;
    }

    try {
      let hasOutput = false;

      for await (const token of provider.stream(messages)) {
        if (!hasOutput) {
          incrementUsage(provider.key, today);
          hasOutput = true;
        }
        yield { token, model: provider.key };
      }

      if (hasOutput) return;
      logger.warn(`Provider ${provider.key} returned no tokens`);
    } catch (err) {
      logger.warn(`Provider ${provider.key} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error('QUOTA_EXCEEDED');
}

export async function summarize(prompt: string): Promise<string> {
  const today = getToday();

  // groq-compound is skipped for summarization to preserve its chat budget
  const providers: Array<{
    key: string;
    limit: number;
    fn: (p: string) => Promise<string>;
  }> = [
    { key: 'groq-chat',   limit: GROQ_CHAT_LIMIT,   fn: summarizeGroq },
    { key: 'gemini',      limit: GEMINI_LIMIT,       fn: summarizeGemini },
    { key: 'openrouter',  limit: OPENROUTER_LIMIT,   fn: summarizeOpenRouter },
  ];

  for (const provider of providers) {
    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) continue;

    if (!isProviderKeyAvailable(provider.key)) continue;

    try {
      incrementUsage(provider.key, today);
      const result = await provider.fn(prompt);
      if (result) return result;
    } catch (err) {
      logger.warn(`Summarize provider ${provider.key} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error('SUMMARIZE_QUOTA_EXCEEDED');
}
