import OpenAI from 'openai';
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

export async function* streamChatOpenRouter(
  messages: ChatMessage[],
  model: string,
): AsyncGenerator<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const stream = await client.chat.completions.create(
    {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );

  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function summarizeOpenRouter(
  prompt: string,
  model: string,
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await client.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return response.choices?.[0]?.message?.content ?? '';
}

export function isOpenRouterAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
