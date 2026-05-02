export interface User {
  userId: number;
  username: string;
  email?: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant' | 'internal';
  content: string;
  model_used: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  model_last_used: string | null;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; model: string; conversationId: string }
  | { type: 'error'; message: string };

export type Intent =
  | 'WEB_SEARCH'
  | 'CODING'
  | 'DEBUGGING'
  | 'TRANSLATING'
  | 'DRAFTING'
  | 'VISUALS'
  | 'DEFAULT';
