export interface User {
  userId: number;
  username: string;
  email?: string;
}

export interface Attachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size?: number;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  model_used: string | null;
  attachments?: Attachment[];
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  model_last_used: string | null;
  has_files?: boolean;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export type Provider = 'auto' | 'groq' | 'gemini' | 'openrouter';

export const PROVIDER_LABELS: Record<Provider, string> = {
  auto: 'Auto',
  groq: 'Groq',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
};

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; model: string; conversationId: string }
  | { type: 'error'; message: string };
