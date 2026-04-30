import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage } from './groqService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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

export async function* streamChatGemini(messages: ChatMessage[]): AsyncGenerator<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const allHistory = toGeminiHistory(messages);

  // Gemini requires history to start with 'user' role
  const history = allHistory.slice(0, -1).filter((_, i, arr) => {
    if (i === 0) return arr[0].role === 'user';
    return true;
  });
  // Drop leading non-user messages from history
  while (history.length > 0 && history[0].role !== 'user') {
    history.shift();
  }

  const lastMsg = allHistory.at(-1)!;
  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMsg.parts);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

export async function summarizeGemini(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
