import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatMessage } from './groqService';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function toGeminiHistory(messages: ChatMessage[]) {
  const history = messages.map((m) => ({
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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const allHistory = toGeminiHistory(messages);
  const history = allHistory.slice(0, -1);
  const lastMessage = messages.at(-1)!.content;

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMessage);

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

export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}
