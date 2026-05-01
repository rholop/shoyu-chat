import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { ChatMessage } from './groqService';

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY!,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const CHAT_MODEL = 'qwen/qwen3.5-397b-a17b';
const CHAT_FALLBACK_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

function isRateLimitError(error: unknown): boolean {
  return (error as { status?: number })?.status === 429;
}

export async function* streamChatNvidia(messages: ChatMessage[]): AsyncGenerator<string> {
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
        logger.warn(`NVIDIA rate limit on ${CHAT_MODEL}, falling back to ${CHAT_FALLBACK_MODEL}`);
        continue;
      }
      throw error;
    }
  }
}

export async function summarizeNvidia(prompt: string): Promise<string> {
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
        logger.warn(`NVIDIA rate limit on ${CHAT_MODEL}, falling back to ${CHAT_FALLBACK_MODEL}`);
        continue;
      }
      throw error;
    }
  }
  return '';
}

export function isNvidiaAvailable(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}
