import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { ChatMessage } from './groqService';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || 'unset',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://holop.dev',
    'X-Title': 'shoyu-chat',
  },
});

const REQUEST_TIMEOUT_MS = 60_000;

export function isRateLimitError(err: unknown): boolean {
  const status = (err as any)?.status || (err as any)?.response?.status;
  return status === 429;
}

function logOpenRouterError(context: string, model: string, err: unknown): void {
  const e = err as any;
  const status   = e?.status ?? e?.response?.status ?? 'unknown';
  const errName  = e?.name ?? 'UnknownError';
  const errMsg   = e?.message ?? String(err);
  // OpenAI SDK puts the parsed API response body in .error
  const body     = e?.error ? JSON.stringify(e.error) : '(no body)';
  logger.error(
    `[openrouter] ${context} | model=${model} status=${status} type=${errName} msg="${errMsg}" body=${body}`,
  );
}

export async function* streamChatOpenRouter(
  messages: ChatMessage[],
  model: string,
): AsyncGenerator<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    logger.error('[openrouter] streamChatOpenRouter called but OPENROUTER_API_KEY is not set');
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  logger.info(`[openrouter] stream request | model=${model} messages=${messages.length}`);

  let stream: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    stream = await client.chat.completions.create(
      {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (err) {
    logOpenRouterError('stream create() failed', model, err);
    throw err;
  }

  let tokenCount = 0;
  try {
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) {
        tokenCount++;
        yield text;
      }
    }
  } catch (err) {
    logOpenRouterError(`stream interrupted after ${tokenCount} tokens`, model, err);
    throw err;
  }

  if (tokenCount === 0) {
    logger.warn(`[openrouter] stream completed with 0 tokens | model=${model}`);
  } else {
    logger.info(`[openrouter] stream done | model=${model} tokens=${tokenCount}`);
  }
}

export async function summarizeOpenRouter(
  prompt: string,
  model: string,
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    logger.error('[openrouter] summarizeOpenRouter called but OPENROUTER_API_KEY is not set');
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  logger.info(`[openrouter] summarize request | model=${model}`);

  let response: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (err) {
    logOpenRouterError('summarize create() failed', model, err);
    throw err;
  }

  const content = (response as any).choices?.[0]?.message?.content ?? '';
  if (!content) {
    logger.warn(`[openrouter] summarize returned empty content | model=${model}`);
  } else {
    logger.info(`[openrouter] summarize done | model=${model} chars=${content.length}`);
  }
  return content;
}

export function isOpenRouterAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
