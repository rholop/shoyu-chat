import { getUsageCount, incrementUsage } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { Intent } from '../types';
import {
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
import { readMemory } from './memoryService';

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

function buildMessagesWithMemory(
  messages: ChatMessage[],
  memoryContext: string | null
): ChatMessage[] {
  if (!memoryContext) return messages;
  return [
    { role: 'system', content: `## User Memory Context\n\n${memoryContext}` },
    ...messages,
  ];
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

interface FallbackConfig {
  key: string;
  limit: number;
  vision: boolean;
  modelLabel: string;
  stream: (msgs: ChatMessage[]) => AsyncGenerator<string>;
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

// Per-intent ordered fallback tiers (T2, T3) used when the T1 specialist fails.
// Each intent defines its own priority list rather than a shared generic chain.
const INTENT_FALLBACK_MAP: Record<Intent, FallbackConfig[]> = {
  // WEB_SEARCH: T1 gemini-search → T2 gemini (no search) → T3 openrouter
  [Intent.WEB_SEARCH]: [
    { key: 'gemini', limit: GEMINI_LIMIT, vision: false, modelLabel: 'gemini', stream: streamChatGemini },
    { key: 'openrouter', limit: OPENROUTER_LIMIT, vision: false, modelLabel: 'openrouter', stream: streamChatOpenRouter },
  ],
  // CODING: T1 nvidia-405b → T2 groq-70b → T3 gemini
  [Intent.CODING]: [
    { key: 'groq-chat', limit: GROQ_CHAT_LIMIT, vision: false, modelLabel: 'groq-chat', stream: streamChatGroqChat, trimContext: true },
    { key: 'gemini', limit: GEMINI_LIMIT, vision: false, modelLabel: 'gemini', stream: streamChatGemini },
  ],
  // DEBUGGING: T1 groq-70b → T2 gemini → T3 openrouter
  [Intent.DEBUGGING]: [
    { key: 'gemini', limit: GEMINI_LIMIT, vision: false, modelLabel: 'gemini', stream: streamChatGemini },
    { key: 'openrouter', limit: OPENROUTER_LIMIT, vision: false, modelLabel: 'openrouter', stream: streamChatOpenRouter },
  ],
  // TRANSLATING: T1 openrouter-mistral → T2 gemini → T3 groq-70b
  [Intent.TRANSLATING]: [
    { key: 'gemini', limit: GEMINI_LIMIT, vision: false, modelLabel: 'gemini', stream: streamChatGemini },
    { key: 'groq-chat', limit: GROQ_CHAT_LIMIT, vision: false, modelLabel: 'groq-chat', stream: streamChatGroqChat, trimContext: true },
  ],
  // DRAFTING: T1 groq-70b → T2 gemini → T3 nvidia-70b
  [Intent.DRAFTING]: [
    { key: 'gemini', limit: GEMINI_LIMIT, vision: false, modelLabel: 'gemini', stream: streamChatGemini },
    { key: 'nvidia', limit: NVIDIA_LIMIT, vision: false, modelLabel: 'nvidia', stream: streamChatNvidia },
  ],
  // SUMMARIZING: T1 gemini → T2 groq-70b → T3 openrouter
  [Intent.SUMMARIZING]: [
    { key: 'groq-chat', limit: GROQ_CHAT_LIMIT, vision: false, modelLabel: 'groq-chat', stream: streamChatGroqChat, trimContext: true },
    { key: 'openrouter', limit: OPENROUTER_LIMIT, vision: false, modelLabel: 'openrouter', stream: streamChatOpenRouter },
  ],
  // IMAGE_ANALYSIS: T1 gemini-vision → T2 nvidia (text-only, skipped when hasImages) → T3 groq
  [Intent.IMAGE_ANALYSIS]: [
    { key: 'nvidia', limit: NVIDIA_LIMIT, vision: false, modelLabel: 'nvidia', stream: streamChatNvidia },
    { key: 'groq-chat', limit: GROQ_CHAT_LIMIT, vision: false, modelLabel: 'groq-chat', stream: streamChatGroqChat, trimContext: true },
  ],
};

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
  injectMemory = true,
): AsyncGenerator<RouterResult> {
  const today = getToday();

  const memoryContext = injectMemory ? readMemory() : null;
  const contextualMessages = buildMessagesWithMemory(messages, memoryContext);

  // Force IMAGE_ANALYSIS when images are present and specialist doesn't support vision
  const specialist =
    hasImages && !SPECIALIST_MAP[intent].vision
      ? SPECIALIST_MAP[Intent.IMAGE_ANALYSIS]
      : SPECIALIST_MAP[intent];

  const msgs = specialist.trimContext ? trimForGroq(contextualMessages) : contextualMessages;

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

  // Per-intent fallback chain (T2, T3)
  const effectiveIntent = hasImages && !SPECIALIST_MAP[intent].vision
    ? Intent.IMAGE_ANALYSIS
    : intent;

  for (const provider of INTENT_FALLBACK_MAP[effectiveIntent]) {
    if (hasImages && !provider.vision) {
      // Skip non-vision fallbacks when the request has images
      continue;
    }

    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) {
      logger.warn(`Fallback ${provider.key} daily limit reached (${usage}/${provider.limit})`);
      continue;
    }

    if (!isProviderKeyAvailable(provider.key)) {
      logger.warn(`Fallback ${provider.key} not available (no API key)`);
      continue;
    }

    const fallbackMsgs = provider.trimContext ? trimForGroq(contextualMessages) : contextualMessages;

    try {
      let hasOutput = false;
      for await (const token of provider.stream(fallbackMsgs)) {
        if (!hasOutput) {
          incrementUsage(provider.key, today);
          hasOutput = true;
        }
        yield { token, model: provider.modelLabel };
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
