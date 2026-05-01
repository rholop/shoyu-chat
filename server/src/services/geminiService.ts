import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage } from './groqService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface GroundingChunk {
  groundingNotes: string;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function toGeminiHistory(messages: ChatMessage[]) {
  return messages.map((m) => {
    const parts: GeminiPart[] = [{ text: m.content }];
    if (m.images && m.role === 'user') {
      for (const img of m.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

function buildGroundingNotes(metadata: Record<string, unknown>): string {
  const parts: string[] = [];

  const queries = metadata.webSearchQueries as string[] | undefined;
  if (queries?.length) {
    parts.push(`Queries: ${queries.join(', ')}`);
  }

  const chunks = metadata.groundingChunks as Array<{ web?: { uri?: string; title?: string } }> | undefined;
  if (chunks?.length) {
    const sources = chunks
      .filter((c) => c.web?.uri)
      .map((c) => `- ${c.web!.title ?? 'Source'}: ${c.web!.uri}`)
      .join('\n');
    if (sources) parts.push(`Sources:\n${sources}`);
  }

  return parts.join('\n\n');
}

function prepareHistory(messages: ChatMessage[]) {
  const allHistory = toGeminiHistory(messages);
  const history = allHistory.slice(0, -1);
  while (history.length > 0 && history[0].role !== 'user') {
    history.shift();
  }
  const lastMsg = allHistory.at(-1)!;
  return { history, lastMsg };
}

export async function* streamChatGemini(messages: ChatMessage[]): AsyncGenerator<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const { history, lastMsg } = prepareHistory(messages);
  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMsg.parts);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

export async function* streamChatGeminiWithSearch(
  messages: ChatMessage[],
): AsyncGenerator<string | GroundingChunk> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ googleSearch: {} }] as any,
  });
  const { history, lastMsg } = prepareHistory(messages);
  const chat = model.startChat({ history });
  const streamResult = await chat.sendMessageStream(lastMsg.parts);

  for await (const chunk of streamResult.stream) {
    const text = chunk.text();
    if (text) yield text;
  }

  try {
    const finalResponse = await streamResult.response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groundingMetadata = (finalResponse.candidates?.[0] as any)?.groundingMetadata as
      | Record<string, unknown>
      | undefined;
    if (groundingMetadata) {
      const notes = buildGroundingNotes(groundingMetadata);
      if (notes) yield { groundingNotes: notes };
    }
  } catch {
    // Grounding metadata extraction is best-effort
  }
}

export async function summarizeGemini(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
