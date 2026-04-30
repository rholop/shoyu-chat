import OpenAI from 'openai';
import { logger } from '../utils/logger';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: 'https://api.groq.com/openai/v1',
});

const COMPOUND_MODEL = 'groq/compound';
const CHAT_MODEL = 'llama-3.3-70b-versatile';
const CHAT_FALLBACK_MODEL = 'llama-3.1-8b-instant';

function isRateLimitError(error: unknown): boolean {
  return (error as { status?: number })?.status === 429;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
}

export interface ImageAttachment {
  mimeType: string;
  base64: string;
  filename: string;
}

export async function* streamChatGroqCompound(messages: ChatMessage[]): AsyncGenerator<string> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  const stream = await client.chat.completions.create({
    model: COMPOUND_MODEL,
    messages: cleanedMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function* streamChatGroqChat(messages: ChatMessage[]): AsyncGenerator<string> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  for (const model of [CHAT_MODEL, CHAT_FALLBACK_MODEL]) {
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: cleanedMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
      return;
    } catch (error) {
      if (model === CHAT_MODEL && isRateLimitError(error)) {
        logger.warn(`Groq rate limit on ${CHAT_MODEL}, falling back to ${CHAT_FALLBACK_MODEL}`);
        continue;
      }
      throw error;
    }
  }
}

export async function summarizeGroq(prompt: string): Promise<string> {
  const messages = [{ role: 'user' as const, content: prompt }];

  for (const model of [CHAT_MODEL, CHAT_FALLBACK_MODEL]) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        stream: false,
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      if (model === CHAT_MODEL && isRateLimitError(error)) {
        logger.warn(`Groq rate limit on ${CHAT_MODEL}, falling back to ${CHAT_FALLBACK_MODEL}`);
        continue;
      }
      throw error;
    }
  }
  return '';
}

export function isGroqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}
