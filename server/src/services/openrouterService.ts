import OpenAI from 'openai';
import { ChatMessage } from './groqService';

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://holop.dev',
    'X-Title': 'Shoyu Chat',
  },
});

export async function* streamChatOpenRouter(messages: ChatMessage[]): AsyncGenerator<string> {
  const stream = await client.chat.completions.create({
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function summarizeOpenRouter(prompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  });
  return response.choices[0]?.message?.content ?? '';
}

export function isOpenRouterAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
