import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { ChatMessage } from './groqService';

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || 'dummy',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const CHAT_MODEL = 'qwen/qwen3.5-397b-a17b';
const CHAT_FALLBACK_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const CODING_MODEL = 'meta/llama-3.1-405b-instruct';

function isRateLimitError(error: unknown): boolean {
  return (error as { status?: number })?.status === 429;
}

export async function* streamChatNvidia(
  messages: ChatMessage[],
  modelName: string = CHAT_MODEL
): AsyncGenerator<string> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  const stream = await client.chat.completions.create({
    model: modelName,
    messages: cleanedMessages,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function* streamChatNvidiaCoding(messages: ChatMessage[]): AsyncGenerator<string> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  for (const model of [CODING_MODEL, CHAT_MODEL, CHAT_FALLBACK_MODEL]) {
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
      if (isRateLimitError(error)) {
        logger.warn(`NVIDIA rate limit on ${model}, trying next model`);
        continue;
      }
      throw error;
    }
  }
}

export async function summarizeNvidia(
  prompt: string,
  modelName: string = CHAT_MODEL
): Promise<string> {
  const messages = [{ role: 'user' as const, content: prompt }];

  const response = await client.chat.completions.create({
    model: modelName,
    messages,
    stream: false,
  });
  return response.choices[0]?.message?.content ?? '';
}

export function isNvidiaAvailable(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}
