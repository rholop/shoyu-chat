import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage } from './groqService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function extractSystemInstruction(messages: ChatMessage[]): string | undefined {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content);
  return sys.length > 0 ? sys.join('\n\n') : undefined;
}

function toGeminiHistory(messages: ChatMessage[]) {
  const history = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  // Gemini requires history to start with 'user' role
  while (history.length > 0 && history[0].role !== 'user') {
    history.shift();
  }

  return history;
}

export async function* streamChatGemini(messages: ChatMessage[]): AsyncGenerator<string> {
  const systemInstruction = extractSystemInstruction(messages);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
  });

  const allHistory = toGeminiHistory(messages);
  const history = allHistory.slice(0, -1);
  const lastMessage = allHistory.at(-1)!.parts[0].text;

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMessage);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

export interface WebSearchStreamResult {
  token?: string;
  groundingContent?: string;
}

export async function* streamChatGeminiWithSearch(
  messages: ChatMessage[]
): AsyncGenerator<WebSearchStreamResult> {
  const systemInstruction = extractSystemInstruction(messages);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    ...(systemInstruction ? { systemInstruction } : {}),
  });

  const contents = toGeminiHistory(messages);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (model as any).generateContentStream({
    contents,
    tools: [{ googleSearch: {} }],
  });

  for await (const chunk of result.stream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (chunk as any).text?.();
    if (text) yield { token: text };
  }

  // Extract grounding metadata (best-effort)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalResponse = await (result as any).response;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grounding = (finalResponse?.candidates?.[0] as any)?.groundingMetadata;
    if (grounding) {
      const queries: string[] = grounding.webSearchQueries ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chunks: any[] = grounding.groundingChunks ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sources = chunks.map((c: any) => c.web).filter(Boolean);

      const lines: string[] = [];
      if (queries.length > 0) {
        lines.push(`**Search queries:** ${queries.join(', ')}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sources.forEach((s: any) => {
        if (s.uri) lines.push(`- [${s.title ?? s.uri}](${s.uri})`);
      });

      if (lines.length > 0) {
        yield { groundingContent: `## Web Search Context\n${lines.join('\n')}` };
      }
    }
  } catch {
    // Grounding metadata is best-effort; continue without it
  }
}

export async function summarizeGemini(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
