import OpenAI from 'openai';
import { logger } from '../utils/logger';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: 'https://api.groq.com/openai/v1',
});

const PRIMARY_MODEL = 'groq/compound';
const FALLBACK_MODEL = 'llama-3.3-70b-versatile';

function isRateLimitError(error: unknown): boolean {
  return (error as { status?: number })?.status === 429;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function* streamChatGroq(messages: ChatMessage[]): AsyncGenerator<string> {
  console.log("DEBUG: Sending to Groq:", JSON.stringify(messages));

  const cleanedMessages = messages.map(m => ({ role: m.role, content: m.content }));

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: cleanedMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          console.log("DEBUG: Token received:", text);
          yield text;
        }
      }
      return;
    } catch (error) {
      if (model === PRIMARY_MODEL && isRateLimitError(error)) {
        logger.warn(`Groq rate limit hit on ${PRIMARY_MODEL}, falling back to ${FALLBACK_MODEL}`);
        continue;
      }
      console.error("GROQ SDK ERROR:", error);
      throw error;
    }
  }
}

export async function summarizeGroq(prompt: string): Promise<string> {
  const messages = [{ role: 'user' as const, content: prompt }];

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        stream: false,
      });
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      if (model === PRIMARY_MODEL && isRateLimitError(error)) {
        logger.warn(`Groq rate limit hit on ${PRIMARY_MODEL}, falling back to ${FALLBACK_MODEL}`);
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
