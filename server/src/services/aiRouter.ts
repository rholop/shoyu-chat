import OpenAI from 'openai';
import { getUsageCount, incrementUsage, setUsageCount } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { Intent } from '../types';
import {
  streamChatGroqChat,
  streamChatGroqChatWithTools,
  isGroqAvailable,
  ChatMessage,
  ProviderToolCall,
} from './groqService';
import {
  streamChatGemini,
  streamChatGeminiWithSearch,
  streamChatGeminiWithTools,
  isGeminiAvailable,
  GroundingChunk,
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
import { summarizeGemini } from './geminiService';
import { summarizeGroq } from './groqService';
import { summarizeOpenRouter } from './openrouterService';

const GROQ_CHAT_LIMIT = Number(process.env.GROQ_CHAT_DAILY_LIMIT ?? 1000);
const GEMINI_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 1500);
const OPENROUTER_LIMIT = Number(process.env.OPENROUTER_DAILY_LIMIT ?? 200);
const NVIDIA_LIMIT = Number(process.env.NVIDIA_DAILY_LIMIT ?? 1000);

const GROQ_MAX_CONTEXT_MESSAGES = 12;

// ── WRITE_FILE Tool ────────────────────────────────────────────────────────────

export const WRITE_FILE_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'write_file',
    description: `Create a new file or overwrite an existing one, making it available for the user to download.
Use this whenever you generate code, scripts, documents, configs, or any content the user might want to save.
Prefer this over putting long file contents in the chat message.
If the user asks to update or modify a file you already created, pass its fileId to overwrite it instead of creating a duplicate.`,
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'The filename including extension. E.g. "script.py", "report.md", "config.json"',
        },
        content: {
          type: 'string',
          description: 'The full text content of the file.',
        },
        description: {
          type: 'string',
          description: 'One sentence describing what this file is and what it does.',
        },
        fileId: {
          type: 'string',
          description: 'If provided, overwrites the existing file with this ID instead of creating a new one. Use this when updating a file you already created in this conversation.',
        },
      },
      required: ['filename', 'content', 'description'],
    },
  },
};

// Gemini function declaration equivalent
const WRITE_FILE_FUNCTION_DECLARATION = {
  name: 'write_file',
  description: WRITE_FILE_TOOL.function.description,
  parameters: WRITE_FILE_TOOL.function.parameters,
};

// ── Types ─────────────────────────────────────────────────────────────────────

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

export interface ToolCallResult {
  toolName: 'write_file';
  args: {
    filename: string;
    content: string;
    description: string;
    fileId?: string;
  };
  model: string;
}

export type RouterResult = StreamResult | InternalNoteResult | ToolCallResult;

type StreamChunk = string | GroundingChunk | ProviderToolCall;

interface TierConfig {
  provider: 'gemini' | 'nvidia' | 'groq-chat' | 'openrouter';
  model: string;
  label: string;
  useSearch?: boolean;
  searchTool?: Record<string, unknown>;
  trimContext?: boolean;
  vision?: boolean;
  noTools?: boolean;
}

// Per-intent ordered fallback tiers (T1→T2→T3).
// The first available tier that succeeds is used; subsequent tiers show "(Fallback)" in label.
const FALLBACK_MATRIX: Record<Intent, TierConfig[]> = {
  [Intent.WEB_SEARCH]: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash', useSearch: true, searchTool: { google_search: {} }, vision: true },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro', useSearch: true, searchTool: { google_search: {} }, vision: true },
    { provider: 'openrouter', model: 'openai/gpt-oss-120b:free', label: 'OR: GPT-oss-120b' },
  ],
  [Intent.CODING]: [
    { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct', label: 'NVIDIA: Llama 3.3 70B' },
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B' },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro' },
  ],
  [Intent.DEBUGGING]: [
    { provider: 'groq-chat', model: 'llama-3.3-70b-versatile', label: 'Groq: Llama 3.3 70B', trimContext: true },
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash' },
    { provider: 'openrouter', model: 'poolside/laguna-m.1:free', label: 'OR: Laguna M.1' },
  ],
  [Intent.TRANSLATING]: [
    { provider: 'openrouter', model: 'openai/gpt-oss-120b:free', label: 'OR: GPT-oss-120b' },
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
    { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free', label: 'OR: Llama 3.2 3B' },
  ],
  [Intent.IMAGE_ANALYSIS]: [
    { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini: 2.5 Flash', vision: true },
    { provider: 'gemini', model: 'gemini-2.5-pro', label: 'Gemini: 2.5 Pro', vision: true },
    { provider: 'openrouter', model: 'openai/gpt-oss-120b:free', label: 'OR: GPT-oss-120b', vision: true },
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

function isProviderToolCall(chunk: unknown): chunk is ProviderToolCall {
  return typeof chunk === 'object' && chunk !== null && 'toolName' in chunk && !('groundingNotes' in chunk);
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

      const useTools = !tier.noTools && !tier.useSearch;

      if (tier.provider === 'gemini') {
        if (tier.useSearch) {
          generator = streamChatGeminiWithSearch(msgs, tier.model, tier.searchTool);
        } else if (useTools) {
          generator = streamChatGeminiWithTools(msgs, tier.model, [WRITE_FILE_FUNCTION_DECLARATION]);
        } else {
          generator = streamChatGemini(msgs, tier.model);
        }
      } else if (tier.provider === 'nvidia') {
        generator = useTools
          ? streamChatNvidiaWithTools(msgs, tier.model, [WRITE_FILE_TOOL])
          : streamChatNvidia(msgs, tier.model);
      } else if (tier.provider === 'groq-chat') {
        generator = useTools
          ? streamChatGroqChatWithTools(msgs, tier.model, [WRITE_FILE_TOOL])
          : streamChatGroqChat(msgs, tier.model);
      } else {
        generator = useTools
          ? streamChatOpenRouterWithTools(msgs, tier.model, [WRITE_FILE_TOOL])
          : streamChatOpenRouter(msgs, tier.model);
      }

      for await (const chunk of generator) {
        if (typeof chunk === 'object' && 'groundingNotes' in chunk) {
          yield { internalNote: (chunk as GroundingChunk).groundingNotes, model: label };
        } else if (isProviderToolCall(chunk)) {
          if (chunk.toolName === 'write_file') {
            if (!hasOutput) {
              incrementUsage(tier.provider, today);
              hasOutput = true;
            }
            const args = chunk.toolArgs as {
              filename?: string;
              content?: string;
              description?: string;
              fileId?: string;
            };
            if (args.filename && args.content && args.description) {
              yield {
                toolName: 'write_file',
                args: {
                  filename: args.filename,
                  content: args.content,
                  description: args.description,
                  fileId: args.fileId,
                },
                model: label,
              };
            }
          }
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

      // 402/403 = billing cap or key hard-limit — provider is dead for the day.
      if (status === 402 || status === 403) {
        setUsageCount(tier.provider, today, PROVIDER_LIMITS[tier.provider]);
        logger.warn(`[aiRouter] ${tier.provider} auto-exhausted for today (status=${status})`);
      }

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
