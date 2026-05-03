import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || 'dummy',
  baseURL: 'https://api.groq.com/openai/v1',
});

const CHAT_MODEL = 'llama-3.3-70b-versatile';

const REQUEST_TIMEOUT_MS = 60_000;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageAttachment[];
}

export interface ImageAttachment {
  mimeType: string;
  base64: string;
  filename: string;
}

export interface ProviderToolCall {
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export async function* streamChatGroqChat(
  messages: ChatMessage[],
  modelName: string = CHAT_MODEL,
): AsyncGenerator<string> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  const stream = await client.chat.completions.create(
    { model: modelName, messages: cleanedMessages, stream: true },
    { timeout: REQUEST_TIMEOUT_MS },
  );

  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function* streamChatGroqChatWithTools(
  messages: ChatMessage[],
  modelName: string,
  tools: OpenAI.ChatCompletionTool[],
): AsyncGenerator<string | ProviderToolCall> {
  const cleanedMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  const stream = await client.chat.completions.create(
    { model: modelName, messages: cleanedMessages, tools, tool_choice: 'auto', stream: true },
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const acc: Record<number, { id: string; name: string; args: string }> = {};

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) yield delta.content;
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!acc[tc.index]) acc[tc.index] = { id: tc.id ?? '', name: '', args: '' };
        if (tc.function?.name) acc[tc.index].name = tc.function.name;
        if (tc.function?.arguments) acc[tc.index].args += tc.function.arguments;
      }
    }
  }

  for (const tc of Object.values(acc)) {
    if (!tc.name) continue;
    try {
      yield { toolName: tc.name, toolArgs: JSON.parse(tc.args) };
    } catch {
      // malformed args — skip
    }
  }
}

export async function summarizeGroq(
  prompt: string,
  modelName: string = CHAT_MODEL,
): Promise<string> {
  const response = await client.chat.completions.create(
    {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return response.choices?.[0]?.message?.content ?? '';
}

export function isGroqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}
