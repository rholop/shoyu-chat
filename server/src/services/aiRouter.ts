import { getUsageCount, incrementUsage } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { Intent } from '../types';
import {
  streamChatGroqCompound,
  streamChatGroqChat,
  summarizeGroq,
  isGroqAvailable,
  ChatMessage,
} from './groqService';
import {
  streamChatGemini,
  streamChatGeminiWithSearch,
  summarizeGemini,
  isGeminiAvailable,
  GroundingChunk,
} from './geminiService';
import {
  streamChatOpenRouter,
  streamChatOpenRouterTranslating,
  summarizeOpenRouter,
  isOpenRouterAvailable,
} from './openrouterService';
import {
  streamChatNvidia,
  streamChatNvidiaCoding,
  summarizeNvidia,
  isNvidiaAvailable,
} from './nvidiaService';

const GROQ_COMPOUND_LIMIT = Number(process.env.GROQ_COMPOUND_DAILY_LIMIT ?? 250);
const GROQ_CHAT_LIMIT = Number(process.env.GROQ_CHAT_DAILY_LIMIT ?? 1000);
const GEMINI_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 1500);
const OPENROUTER_LIMIT = Number(process.env.OPENROUTER_DAILY_LIMIT ?? 200);
const NVIDIA_LIMIT = Number(process.env.NVIDIA_DAILY_LIMIT ?? 1000);

// Maximum messages kept in context for Groq to stay within token limits
const GROQ_MAX_CONTEXT_MESSAGES = 12;

function isProviderKeyAvailable(key: string): boolean {
  if (key === 'groq-compound' || key === 'groq-chat') return isGroqAvailable();
  if (key === 'gemini') return isGeminiAvailable();
  if (key === 'openrouter') return isOpenRouterAvailable();
  if (key === 'nvidia') return isNvidiaAvailable();
  return false;
}

export interface StreamResult {
  token: string;
  model: string;
}

export interface InternalNoteResult {
  internalNote: string;
  model: string;
}

export type RouterResult = StreamResult | InternalNoteResult;

type StreamChunk = string | GroundingChunk;

interface SpecialistConfig {
  providerKey: string;
  limit: number;
  vision: boolean;
  modelLabel: string;
  stream: (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>;
  trimContext?: boolean;
}

const SPECIALIST_MAP: Record<Intent, SpecialistConfig> = {
  [Intent.WEB_SEARCH]: {
    providerKey: 'gemini',
    limit: GEMINI_LIMIT,
    vision: false,
    modelLabel: 'gemini',
    stream: streamChatGeminiWithSearch as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
  },
  [Intent.CODING]: {
    providerKey: 'nvidia',
    limit: NVIDIA_LIMIT,
    vision: false,
    modelLabel: 'nvidia',
    stream: streamChatNvidiaCoding as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
  },
  [Intent.DEBUGGING]: {
    providerKey: 'groq-chat',
    limit: GROQ_CHAT_LIMIT,
    vision: false,
    modelLabel: 'groq-chat',
    stream: streamChatGroqChat as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
    trimContext: true,
  },
  [Intent.TRANSLATING]: {
    providerKey: 'openrouter',
    limit: OPENROUTER_LIMIT,
    vision: false,
    modelLabel: 'openrouter',
    stream: streamChatOpenRouterTranslating as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
  },
  [Intent.DRAFTING]: {
    providerKey: 'groq-chat',
    limit: GROQ_CHAT_LIMIT,
    vision: false,
    modelLabel: 'groq-chat',
    stream: streamChatGroqChat as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
    trimContext: true,
  },
  [Intent.SUMMARIZING]: {
    providerKey: 'gemini',
    limit: GEMINI_LIMIT,
    vision: false,
    modelLabel: 'gemini',
    stream: streamChatGemini as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
  },
  [Intent.IMAGE_ANALYSIS]: {
    providerKey: 'gemini',
    limit: GEMINI_LIMIT,
    vision: true,
    modelLabel: 'gemini',
    stream: streamChatGemini as (msgs: ChatMessage[]) => AsyncGenerator<StreamChunk>,
  },
};

// Ordered fallback chain when the specialist is unavailable or fails
const FALLBACK_CHAIN: Array<{
  key: string;
  limit: number;
  vision: boolean;
  stream: (msgs: ChatMessage[]) => AsyncGenerator<string>;
}> = [
  { key: 'nvidia', limit: NVIDIA_LIMIT, vision: false, stream: streamChatNvidia },
  { key: 'gemini', limit: GEMINI_LIMIT, vision: true, stream: streamChatGemini },
  { key: 'groq-compound', limit: GROQ_COMPOUND_LIMIT, vision: false, stream: streamChatGroqCompound },
  { key: 'groq-chat', limit: GROQ_CHAT_LIMIT, vision: false, stream: streamChatGroqChat },
  { key: 'openrouter', limit: OPENROUTER_LIMIT, vision: false, stream: streamChatOpenRouter },
];

function trimForGroq(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const trimmed = rest.slice(-GROQ_MAX_CONTEXT_MESSAGES);
  return [...system, ...trimmed];
}

export async function* streamChat(
  messages: ChatMessage[],
  intent: Intent = Intent.CODING,
  hasImages = false,
): AsyncGenerator<RouterResult> {
  const today = getToday();

  // Force IMAGE_ANALYSIS when images are present and specialist doesn't support vision
  const specialist =
    hasImages && !SPECIALIST_MAP[intent].vision
      ? SPECIALIST_MAP[Intent.IMAGE_ANALYSIS]
      : SPECIALIST_MAP[intent];

  const msgs = specialist.trimContext ? trimForGroq(messages) : messages;

  const specialistUsage = getUsageCount(specialist.providerKey, today);
  const specialistAvailable =
    specialistUsage < specialist.limit && isProviderKeyAvailable(specialist.providerKey);

  if (specialistAvailable) {
    try {
      let hasOutput = false;
      for await (const chunk of specialist.stream(msgs)) {
        if (typeof chunk === 'object' && 'groundingNotes' in chunk) {
          yield { internalNote: (chunk as GroundingChunk).groundingNotes, model: specialist.modelLabel };
        } else {
          if (!hasOutput) {
            incrementUsage(specialist.providerKey, today);
            hasOutput = true;
          }
          yield { token: chunk as string, model: specialist.modelLabel };
        }
      }
      if (hasOutput) return;
      logger.warn(`Specialist ${specialist.providerKey} returned no tokens`);
    } catch (err) {
      logger.warn(
        `Specialist ${specialist.providerKey} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  } else {
    logger.warn(
      `Specialist ${specialist.providerKey} unavailable or at daily limit (${specialistUsage}/${specialist.limit})`,
    );
  }

  // Fallback chain
  for (const provider of FALLBACK_CHAIN) {
    if (provider.key === specialist.providerKey) continue;
    if (hasImages && !provider.vision) continue;

    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) {
      logger.warn(`Fallback ${provider.key} daily limit reached (${usage}/${provider.limit})`);
      continue;
    }

    if (!isProviderKeyAvailable(provider.key)) {
      logger.warn(`Fallback ${provider.key} not available (no API key)`);
      continue;
    }

    const fallbackMsgs =
      provider.key === 'groq-chat' || provider.key === 'groq-compound'
        ? trimForGroq(messages)
        : messages;

    try {
      let hasOutput = false;
      for await (const token of provider.stream(fallbackMsgs)) {
        if (!hasOutput) {
          incrementUsage(provider.key, today);
          hasOutput = true;
        }
        yield { token, model: provider.key };
      }
      if (hasOutput) return;
      logger.warn(`Fallback ${provider.key} returned no tokens`);
    } catch (err) {
      logger.warn(`Fallback ${provider.key} failed: ${err instanceof Error ? err.message : err}`);
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
    { key: 'nvidia', limit: NVIDIA_LIMIT, fn: summarizeNvidia },
    { key: 'gemini', limit: GEMINI_LIMIT, fn: summarizeGemini },
    { key: 'groq-chat', limit: GROQ_CHAT_LIMIT, fn: summarizeGroq },
    { key: 'openrouter', limit: OPENROUTER_LIMIT, fn: summarizeOpenRouter },
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
      logger.warn(
        `Summarize provider ${provider.key} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  throw new Error('SUMMARIZE_QUOTA_EXCEEDED');
}
