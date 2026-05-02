import OpenAI from 'openai';
import { ChatMessage } from './groqService';
import { logger } from '../utils/logger';

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY!,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

export function isNvidiaAvailable(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}

export async function* streamChatNvidia(
  messages: ChatMessage[],
  model: string = 'meta/llama-3.1-405b-instruct'
): AsyncGenerator<string> {
  try {
    const stream = await client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      max_tokens: 4096,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  } catch (error) {
    logger.error('NVIDIA stream error:', error);
    throw error;
  }
}
