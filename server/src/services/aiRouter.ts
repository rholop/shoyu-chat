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
} from './nvidiaService';
import { readMemory } from './memoryService';

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
  trimContext?: boolean;
  vision?: boolean;
}

const FALLBACK_MATRIX: Record<Intent, TierConfig[]> = {
  [Intent.WEB_SEARCH]: [
    { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini: 2.0 Flash', useSearch: true },
    { provider: 'gemini', model: 'gemini-1.5-pro', label: 'Gemini: 1.5 Pro', useSearch: true },
    { provider: 'openrouter', model: 'meta-llama/llama-3.1-70b-instruct', label: 'OR: Llama 3.1 70B' },
  ],
  [Intent.CODING]: [
    { provider: 'nvidia', model: 'meta/llama-3.1-405b-instruct', label: 'NVIDIA: Llama 3.1 405B' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
    { provider: 'gemini', model: 'gemini-1.5-pro', label: 'Gemini: 1.5 Pro' },
  ],
  [Intent.DEBUGGING]: [
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B', trimContext: true },
    { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini: 2.0 Flash' },
    { provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', label: 'OR: Qwen 2.5 72B' },
  ],
  [Intent.TRANSLATING]: [
    { provider: 'openrouter', model: 'mistralai/mistral-large', label: 'OR: Mistral Large' },
    { provider: 'gemini', model: 'gemini-1.5-pro', label: 'Gemini: 1.5 Pro' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
  ],
  [Intent.DRAFTING]: [
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B', trimContext: true },
    { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini: 2.0 Flash' },
    { provider: 'nvidia', model: 'meta/llama-3.1-70b-instruct', label: 'NVIDIA: Llama 3.1 70B' },
  ],
  [Intent.SUMMARIZING]: [
    { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini: 2.0 Flash' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
    { provider: 'openrouter', model: 'mistralai/mistral-small', label: 'OR: Mistral Small' },
  ],
  [Intent.IMAGE_ANALYSIS]: [
    { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini: 2.0 Flash', vision: true },
    { provider: 'gemini', model: 'gemini-1.5-pro', label: 'Gemini: 1.5 Pro', vision: true },
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

function isRetryable(error: any): boolean {
  const status = error?.status || error?.response?.status;
  if (status === 429 || status >= 500) return true;
  const msg = error?.message?.toLowerCase() || '';
  if (msg.includes('timeout') || msg.includes('rate limit') || msg.includes('deadline')) return true;
  return false;
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

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const isFallback = i > 0;
    const label = isFallback ? `${tier.label} (Fallback)` : tier.label;

    if (hasImages && !tier.vision && intent !== Intent.IMAGE_ANALYSIS) {
        // If we have images but current tier doesn't support vision, and we're not explicitly in IMAGE_ANALYSIS,
        // we should probably have switched intent earlier, but as a safeguard we skip non-vision tiers.
        // Actually, the Design Doc says Intent.VISUALS is Tier 1 Gemini 2.0 Flash.
        // If the user is in CODING but sends an image, we should skip tiers that don't support vision.
        continue;
    }

    const usage = getUsageCount(tier.provider, today);
    if (usage >= PROVIDER_LIMITS[tier.provider]) {
      logger.warn(`Tier ${i+1} (${tier.provider}) at daily limit`);
      continue;
    }

    if (!isProviderKeyAvailable(tier.provider)) {
      logger.warn(`Tier ${i+1} (${tier.provider}) API key missing`);
      continue;
    }

    const msgs = tier.trimContext ? trimForGroq(contextualMessages) : contextualMessages;

    try {
      let hasOutput = false;
      let generator: AsyncGenerator<StreamChunk>;

      if (tier.provider === 'gemini') {
        generator = tier.useSearch
          ? streamChatGeminiWithSearch(msgs, tier.model)
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
      logger.warn(`Tier ${i+1} (${tier.label}) returned no tokens`);
    } catch (err) {
      if (isRetryable(err) && i < tiers.length - 1) {
        logger.warn(`Tier ${i+1} failed, retrying next tier: ${err instanceof Error ? err.message : err}`);
        continue;
      }
      logger.error(`Tier ${i+1} failed permanently: ${err instanceof Error ? err.message : err}`);
      if (i === tiers.length - 1) break;
      throw err;
    }
  }

  throw new Error('QUOTA_EXCEEDED');
}

export async function summarize(prompt: string): Promise<string> {
  const today = getToday();

  // Use a sensible default sequence for summarization fallbacks
  const providers: Array<{
    provider: 'nvidia' | 'gemini' | 'groq-chat' | 'openrouter';
    model: string;
  }> = [
    { provider: 'nvidia', model: 'meta/llama-3.1-405b-instruct' },
    { provider: 'gemini', model: 'gemini-2.0-flash' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile' },
    { provider: 'openrouter', model: 'mistralai/mistral-small' },
  ];

  for (const p of providers) {
    const usage = getUsageCount(p.provider, today);
    if (usage >= PROVIDER_LIMITS[p.provider]) continue;
    if (!isProviderKeyAvailable(p.provider)) continue;

    try {
      const result = await (p.provider === 'nvidia' ? import('./nvidiaService').then(m => m.summarizeNvidia(prompt, p.model)) :
                           p.provider === 'gemini' ? import('./geminiService').then(m => m.summarizeGemini(prompt, p.model)) :
                           p.provider === 'groq-chat' ? import('./groqService').then(m => m.summarizeGroq(prompt, p.model)) :
                           import('./openrouterService').then(m => m.summarizeOpenRouter(prompt, p.model)));

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
