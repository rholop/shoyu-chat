export interface User {
  userId: number;
  username: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  model_used: string | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  user_id: number;
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
  | { type: 'done'; model: string; messageId: number; conversationId: number }
  | { type: 'error'; message: string };
