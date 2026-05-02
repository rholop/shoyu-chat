import { getUsageCount, incrementUsage } from '../storage';
import { getToday } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { streamChatGroq, summarizeGroq, isGroqAvailable, ChatMessage } from './groqService';
import {
  streamChatGemini,
  streamChatGeminiWithSearch,
  summarizeGemini,
  isGeminiAvailable,
} from './geminiService';
import { streamChatOpenRouter, summarizeOpenRouter, isOpenRouterAvailable } from './openrouterService';
import { streamChatNvidia, isNvidiaAvailable } from './nvidiaService';
import { readMemory } from './memoryService';

const GROQ_CHAT_LIMIT = Number(process.env.GROQ_CHAT_DAILY_LIMIT ?? 14400);
const GROQ_SUMMARY_LIMIT = Number(process.env.GROQ_SUMMARY_DAILY_LIMIT ?? 1000);
const GEMINI_LIMIT = Number(process.env.GEMINI_DAILY_LIMIT ?? 1500);
const OPENROUTER_LIMIT = Number(process.env.OPENROUTER_DAILY_LIMIT ?? 200);
const NVIDIA_LIMIT = Number(process.env.NVIDIA_DAILY_LIMIT ?? 500);

export type Intent =
  | 'WEB_SEARCH'
  | 'CODING'
  | 'DEBUGGING'
  | 'TRANSLATING'
  | 'DRAFTING'
  | 'VISUALS'
  | 'DEFAULT';

export type StreamResult =
  | { type: 'token'; token: string; model: string }
  | { type: 'internal'; content: string; model: string };

function isRateLimitError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('quota');
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

// ── Specialist: Gemini (WEB_SEARCH / VISUALS) ─────────────────────────────────

async function* tryGeminiSpecialist(
  messages: ChatMessage[],
  intent: 'WEB_SEARCH' | 'VISUALS',
  today: string
): AsyncGenerator<StreamResult> {
  if (!isGeminiAvailable()) return;
  const usage = getUsageCount('gemini', today);
  if (usage >= GEMINI_LIMIT) {
    logger.error(`Gemini daily limit reached (${usage}/${GEMINI_LIMIT})`);
    return;
  }

  try {
    let hasOutput = false;

    if (intent === 'WEB_SEARCH') {
      for await (const result of streamChatGeminiWithSearch(messages)) {
        if (result.token) {
          if (!hasOutput) {
            incrementUsage('gemini', today);
            hasOutput = true;
          }
          yield { type: 'token', token: result.token, model: 'gemini' };
        }
        if (result.groundingContent) {
          yield { type: 'internal', content: result.groundingContent, model: 'gemini' };
        }
      }
    } else {
      for await (const token of streamChatGemini(messages)) {
        if (!hasOutput) {
          incrementUsage('gemini', today);
          hasOutput = true;
        }
        yield { type: 'token', token, model: 'gemini' };
      }
    }

    if (hasOutput) return;
    logger.error('Gemini returned no tokens');
  } catch (err) {
    logger.warn(`Gemini (${intent}) failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Specialist: NVIDIA Llama 405B (CODING) ────────────────────────────────────

async function* tryNvidiaSpecialist(
  messages: ChatMessage[],
  today: string
): AsyncGenerator<StreamResult> {
  if (!isNvidiaAvailable()) return;
  const usage = getUsageCount('nvidia', today);
  if (usage >= NVIDIA_LIMIT) {
    logger.error(`NVIDIA daily limit reached (${usage}/${NVIDIA_LIMIT})`);
    return;
  }

  try {
    let hasOutput = false;
    for await (const token of streamChatNvidia(messages)) {
      if (!hasOutput) {
        incrementUsage('nvidia', today);
        hasOutput = true;
      }
      yield { type: 'token', token, model: 'nvidia-llama-405b' };
    }
    if (hasOutput) return;
    logger.error('NVIDIA returned no tokens');
  } catch (err) {
    logger.warn(`NVIDIA failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Specialist: Groq Llama 3.3 70B Versatile (DEBUGGING / DRAFTING) ──────────

async function* tryGroqVersatileSpecialist(
  messages: ChatMessage[],
  intent: Intent,
  today: string
): AsyncGenerator<StreamResult> {
  if (!isGroqAvailable()) return;
  const usage = getUsageCount('groq-chat', today);
  if (usage >= GROQ_CHAT_LIMIT) {
    logger.error(`Groq daily limit reached (${usage}/${GROQ_CHAT_LIMIT})`);
    return;
  }

  try {
    let hasOutput = false;
    for await (const token of streamChatGroq(messages, 'llama-3.3-70b-versatile')) {
      if (!hasOutput) {
        incrementUsage('groq-chat', today);
        hasOutput = true;
      }
      yield { type: 'token', token, model: 'groq-llama-versatile' };
    }
    if (hasOutput) return;
    logger.error(`Groq (${intent}) returned no tokens`);
  } catch (err) {
    logger.warn(`Groq (${intent}) failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Specialist: OpenRouter Mistral Large (TRANSLATING) ────────────────────────

async function* tryMistralSpecialist(
  messages: ChatMessage[],
  today: string
): AsyncGenerator<StreamResult> {
  if (!isOpenRouterAvailable()) return;
  const usage = getUsageCount('openrouter', today);
  if (usage >= OPENROUTER_LIMIT) {
    logger.error(`OpenRouter daily limit reached (${usage}/${OPENROUTER_LIMIT})`);
    return;
  }

  try {
    let hasOutput = false;
    for await (const token of streamChatOpenRouter(messages, 'mistralai/mistral-large')) {
      if (!hasOutput) {
        incrementUsage('openrouter', today);
        hasOutput = true;
      }
      yield { type: 'token', token, model: 'mistral-large' };
    }
    if (hasOutput) return;
    logger.error('OpenRouter (TRANSLATING) returned no tokens');
  } catch (err) {
    logger.warn(`OpenRouter (TRANSLATING) failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Default fallback chain: Groq → Gemini → OpenRouter ───────────────────────

async function* defaultFallback(
  messages: ChatMessage[],
  today: string
): AsyncGenerator<StreamResult> {
  const providers: Array<{
    name: string;
    key: string;
    limit: number;
    available: () => boolean;
    stream: (msgs: ChatMessage[]) => AsyncGenerator<string>;
  }> = [
    {
      name: 'groq-chat',
      key: 'groq-chat',
      limit: GROQ_CHAT_LIMIT,
      available: isGroqAvailable,
      stream: streamChatGroq,
    },
    {
      name: 'gemini',
      key: 'gemini',
      limit: GEMINI_LIMIT,
      available: isGeminiAvailable,
      stream: streamChatGemini,
    },
    {
      name: 'openrouter',
      key: 'openrouter',
      limit: OPENROUTER_LIMIT,
      available: isOpenRouterAvailable,
      stream: streamChatOpenRouter,
    },
  ];

  for (const provider of providers) {
    if (!provider.available()) {
      logger.error(`Provider ${provider.name} is not available (no API key)`);
      continue;
    }
    const usage = getUsageCount(provider.key, today);
    if (usage >= provider.limit) {
      logger.error(`Provider ${provider.name} daily limit reached (${usage}/${provider.limit})`);
      continue;
    }

    try {
      let hasOutput = false;
      for await (const token of provider.stream(messages)) {
        if (!hasOutput) {
          incrementUsage(provider.key, today);
          hasOutput = true;
        }
        yield { type: 'token', token, model: provider.name };
      }
      if (hasOutput) return;
      logger.error(`Provider ${provider.name} returned no tokens`);
    } catch (err) {
      logger.warn(`Provider ${provider.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      logger.error(`Provider ${provider.name} failed:`, err);
    }
  }

  throw new Error('QUOTA_EXCEEDED');
}

// ── Intent-based routing ──────────────────────────────────────────────────────

async function* routeByIntent(
  messages: ChatMessage[],
  intent: Intent,
  today: string
): AsyncGenerator<StreamResult> {
  switch (intent) {
    case 'WEB_SEARCH':
    case 'VISUALS': {
      let yielded = false;
      for await (const result of tryGeminiSpecialist(messages, intent, today)) {
        yielded = true;
        yield result;
      }
      if (yielded) return;
      break;
    }

    case 'CODING': {
      let yielded = false;
      for await (const result of tryNvidiaSpecialist(messages, today)) {
        yielded = true;
        yield result;
      }
      if (yielded) return;
      break;
    }

    case 'DEBUGGING':
    case 'DRAFTING': {
      let yielded = false;
      for await (const result of tryGroqVersatileSpecialist(messages, intent, today)) {
        yielded = true;
        yield result;
      }
      if (yielded) return;
      break;
    }

    case 'TRANSLATING': {
      let yielded = false;
      for await (const result of tryMistralSpecialist(messages, today)) {
        yielded = true;
        yield result;
      }
      if (yielded) return;
      break;
    }

    default:
      break;
  }

  // Specialist failed or DEFAULT intent — use standard fallback chain
  yield* defaultFallback(messages, today);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function* streamChat(
  messages: ChatMessage[],
  intent: Intent = 'DEFAULT',
  injectMemory: boolean = true
): AsyncGenerator<StreamResult> {
  const today = getToday();
  const memoryContext = injectMemory ? readMemory() : null;
  const contextualMessages = buildMessagesWithMemory(messages, memoryContext);

  yield* routeByIntent(contextualMessages, intent, today);
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
