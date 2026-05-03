import { getUsageCount, incrementUsage } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { Intent } from '../types';
import {
  streamChatGroqChat,
  isGroqAvailable,
  ChatMessage,
} from './groqService';
import {
  streamChatGemini,
  streamChatGeminiWithSearch,
  isGeminiAvailable,
  GroundingChunk,
} from './geminiService';
import {
  streamChatOpenRouter,
  isOpenRouterAvailable,
} from './openrouterService';
import {
  streamChatNvidia,
  isNvidiaAvailable,
  summarizeNvidia,
} from './nvidiaService';
import { readMemory } from './memoryService';
import { summarizeGemini } from './geminiService';
import { summarizeGroq } from './groqService';
import { summarizeOpenRouter } from './openrouterService';

const GROQ_CHAT_LIMIT = Number(process.env.GROQ_CHAT_DAILY_LIMIT ?? 1000);
const GEMINI_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 1500);
const OPENROUTER_LIMIT = Number(process.env.OPENROUTER_DAILY_LIMIT ?? 200);
const NVIDIA_LIMIT = Number(process.env.NVIDIA_DAILY_LIMIT ?? 1000);

const GROQ_MAX_CONTEXT_MESSAGES = 12;

function isProviderKeyAvailable(key: string): boolean {
  if (key === 'groq-chat') return isGroqAvailable();
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

interface TierConfig {
  provider: 'gemini' | 'nvidia' | 'groq-chat' | 'openrouter';
  model: string;
  label: string;
  useSearch?: boolean;
  searchTool?: Record<string, unknown>;
  trimContext?: boolean;
  vision?: boolean;
}

// Per-intent ordered fallback tiers (T1→T2→T3).
// The first available tier that succeeds is used; subsequent tiers show "(Fallback)" in label.
const FALLBACK_MATRIX: Record<Intent, TierConfig[]> = {
  [Intent.WEB_SEARCH]: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash', useSearch: true, searchTool: { google_search: {} }, vision: true },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro', useSearch: true, searchTool: { google_search: {} }, vision: true },
    { provider: 'openrouter', model: 'perplexity/sonar-pro', label: 'OR: Perplexity Sonar Pro' },
  ],
  [Intent.CODING]: [
    { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct', label: 'NVIDIA: Llama 3.3 70B' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro' },
  ],
  [Intent.DEBUGGING]: [
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B', trimContext: true },
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash' },
    { provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', label: 'OR: Qwen 2.5 72B' },
  ],
  [Intent.TRANSLATING]: [
    { provider: 'openrouter', model: 'mistralai/mistral-large-2411', label: 'OR: Mistral Large' },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
  ],
  [Intent.DRAFTING]: [
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B', trimContext: true },
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash' },
    { provider: 'nvidia', model: 'meta/llama-3.1-70b-instruct', label: 'NVIDIA: Llama 3.1 70B' },
  ],
  [Intent.SUMMARIZING]: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
    { provider: 'openrouter', model: 'mistralai/mistral-small-2409', label: 'OR: Mistral Small' },
  ],
  [Intent.IMAGE_ANALYSIS]: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash', vision: true },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro', vision: true },
    { provider: 'openrouter', model: 'openai/gpt-4o-mini', label: 'OR: GPT-4o-mini', vision: true },
  ],
};

const PROVIDER_LIMITS: Record<string, number> = {
  'groq-chat': GROQ_CHAT_LIMIT,
  gemini: GEMINI_LIMIT,
  openrouter: OPENROUTER_LIMIT,
  nvidia: NVIDIA_LIMIT,
};

function trimForGroq(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const trimmed = rest.slice(-GROQ_MAX_CONTEXT_MESSAGES);
  return [...system, ...trimmed];
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number; response?: { status?: number } })?.status
    || (error as { response?: { status?: number } })?.response?.status;
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? '';
  return msg.includes('timeout') || msg.includes('rate limit') || msg.includes('deadline');
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

  const tiers = FALLBACK_MATRIX[intent] || FALLBACK_MATRIX[Intent.CODING];

  let anyTierAttempted = false;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const isFallback = i > 0;
    const label = isFallback ? `${tier.label} (Fallback)` : tier.label;

    if (hasImages && !tier.vision && intent !== Intent.IMAGE_ANALYSIS) {
      continue;
    }

    const usage = getUsageCount(tier.provider, today);
    if (usage >= PROVIDER_LIMITS[tier.provider]) {
      logger.warn(`Tier ${i+1} skipped: ${tier.provider} at daily limit (${usage}/${PROVIDER_LIMITS[tier.provider]})`);
      continue;
    }

    if (!isProviderKeyAvailable(tier.provider)) {
      logger.warn(`Tier ${i+1} skipped: ${tier.provider} API key missing (${tier.label} | model=${tier.model})`);
      continue;
    }

    anyTierAttempted = true;
    logger.info(`Tier ${i+1} selected: ${tier.label} | model=${tier.model} | intent=${intent}`);
    const msgs = tier.trimContext ? trimForGroq(contextualMessages) : contextualMessages;

    try {
      let hasOutput = false;
      let generator: AsyncGenerator<StreamChunk>;

      if (tier.provider === 'gemini') {
        generator = tier.useSearch
          ? streamChatGeminiWithSearch(msgs, tier.model, tier.searchTool)
          : streamChatGemini(msgs, tier.model);
      } else if (tier.provider === 'nvidia') {
        generator = streamChatNvidia(msgs, tier.model);
      } else if (tier.provider === 'groq-chat') {
        generator = streamChatGroqChat(msgs, tier.model);
      } else {
        generator = streamChatOpenRouter(msgs, tier.model);
      }

      for await (const chunk of generator) {
        if (typeof chunk === 'object' && 'groundingNotes' in chunk) {
          yield { internalNote: (chunk as GroundingChunk).groundingNotes, model: label };
        } else {
          if (!hasOutput) {
            incrementUsage(tier.provider, today);
            hasOutput = true;
          }
          yield { token: chunk as string, model: label };
        }
      }
      if (hasOutput) return;
      logger.warn(`Tier ${i + 1} (${tier.label}) returned no tokens`);
    } catch (err) {
      const e = err as any;
      const status  = e?.status ?? e?.response?.status ?? 'unknown';
      const errName = e?.name ?? (err instanceof Error ? err.constructor.name : 'UnknownError');
      const errMsg  = e?.message ?? String(err);
      const body    = e?.error ? ` body=${JSON.stringify(e.error)}` : '';
      const detail  = `provider=${tier.provider} model=${tier.model} status=${status} type=${errName} msg="${errMsg}"${body}`;

      const isLastTier = i === tiers.length - 1;

      if (!isLastTier) {
        const logFn = isRetryable(err) ? logger.warn : logger.error;
        logFn(`Tier ${i+1} (${tier.label}) failed, trying next: ${detail}`);
        continue;
      }

      logger.error(`All tiers exhausted for intent=${intent}. Last failure: ${detail}`);
      throw err;
    }
  }

  throw new Error(anyTierAttempted ? 'ALL_PROVIDERS_FAILED' : 'QUOTA_EXCEEDED');
}

export async function summarize(prompt: string): Promise<string> {
  const today = getToday();

  const providers: Array<{
    provider: 'nvidia' | 'gemini' | 'groq-chat' | 'openrouter';
    model: string;
  }> = [
    { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct' },
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile' },
    { provider: 'openrouter', model: 'mistralai/mistral-small-2409' },
  ];

  for (const p of providers) {
    const usage = getUsageCount(p.provider, today);
    if (usage >= PROVIDER_LIMITS[p.provider]) continue;
    if (!isProviderKeyAvailable(p.provider)) continue;

    try {
      const result = await (
        p.provider === 'nvidia' ? summarizeNvidia(prompt, p.model) :
        p.provider === 'gemini' ? summarizeGemini(prompt, p.model) :
        p.provider === 'groq-chat' ? summarizeGroq(prompt, p.model) :
        summarizeOpenRouter(prompt, p.model)
      );

      if (result) {
        incrementUsage(p.provider, today);
        return result;
      }
    } catch (err) {
      logger.warn(`Summarize fallback failed for ${p.provider}: ${err}`);
    }
  }

  throw new Error('SUMMARIZE_QUOTA_EXCEEDED');
}
