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
  projectId?: string | null;
  created_at: string;
  updated_at: string;
  model_last_used: string | null;
  has_files?: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  conversationCount: number;
}

export interface ProjectDetail extends Omit<Project, 'conversationCount'> {
  contextDoc: string;
  summary: string;
  conversations: Conversation[];
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; model: string; conversationId: string }
  | { type: 'error'; message: string };
