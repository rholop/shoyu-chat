import OpenAI from 'openai';
import { logger } from '../utils/logger';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: 'https://api.groq.com/openai/v1',
});

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function* streamChatGroq(
  messages: ChatMessage[],
  model: string = 'llama-3.1-8b-instant'
): AsyncGenerator<string> {
  try {
    const stream = await client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  } catch (error) {
    logger.error('Groq stream error:', error);
    throw error;
  }
}

export async function summarizeGroq(prompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  });
  return response.choices[0]?.message?.content ?? '';
}

export function isGroqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}
