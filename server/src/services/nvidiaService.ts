import OpenAI from 'openai';
import { ChatMessage } from './groqService';

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || 'dummy',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const REQUEST_TIMEOUT_MS = 60_000;

export async function* streamChatNvidia(
  messages: ChatMessage[],
  modelName: string,
): AsyncGenerator<string> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  const stream = await client.chat.completions.create(
    { model: modelName, messages: cleanedMessages, stream: true },
    { timeout: REQUEST_TIMEOUT_MS },
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function summarizeNvidia(
  prompt: string,
  modelName: string,
): Promise<string> {
  const response = await client.chat.completions.create(
    {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return response.choices[0]?.message?.content ?? '';
}

export function isNvidiaAvailable(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}
