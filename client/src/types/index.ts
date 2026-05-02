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
  role: 'user' | 'assistant' | 'internal';
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

export enum Intent {
  WEB_SEARCH = 'WEB_SEARCH',
  CODING = 'CODING',
  DEBUGGING = 'DEBUGGING',
  TRANSLATING = 'TRANSLATING',
  DRAFTING = 'DRAFTING',
  SUMMARIZING = 'SUMMARIZING',
  IMAGE_ANALYSIS = 'IMAGE_ANALYSIS',
}

export interface IntentConfig {
  label: string;
  icon: string;
  description: string;
}

export const INTENT_CONFIG: Record<Intent, IntentConfig> = {
  [Intent.WEB_SEARCH]: {
    label: 'Web Search',
    icon: '🌐',
    description: 'Real-time facts, news & docs',
  },
  [Intent.CODING]: {
    label: 'Coding',
    icon: '💻',
    description: 'Write & refactor code',
  },
  [Intent.DEBUGGING]: {
    label: 'Debugging',
    icon: '🐞',
    description: 'Fix errors & explain logs',
  },
  [Intent.TRANSLATING]: {
    label: 'Translating',
    icon: '文',
    description: 'Nuanced language translation',
  },
  [Intent.DRAFTING]: {
    label: 'Drafting',
    icon: '✍️',
    description: 'Articles, emails & Markdown',
  },
  [Intent.SUMMARIZING]: {
    label: 'Summarizing',
    icon: '📝',
    description: 'Distil long content to bullets',
  },
  [Intent.IMAGE_ANALYSIS]: {
    label: 'Image Analysis',
    icon: '👁️',
    description: 'Explain charts & screenshots',
  },
};

export const INTENT_MODEL_LABELS: Record<string, string> = {
  gemini: 'Gemini 2.0 Flash',
  nvidia: 'Llama 3.1 405B',
  'groq-chat': 'Llama 3.3 70B',
  'groq-compound': 'Groq⚡',
  openrouter: 'Mistral Large',
  'Gemini: 2.0 Flash': 'Gemini 2.0 Flash',
  'Gemini: 1.5 Pro': 'Gemini 1.5 Pro',
  'NVIDIA: Llama 3.1 405B': 'Llama 3.1 405B',
  'NVIDIA: Llama 3.1 70B': 'Llama 3.1 70B',
  'Groq: Llama 3.3 70B': 'Llama 3.3 70B',
  'OR: Perplexity Sonar Pro': 'Perplexity Sonar Pro',
  'OR: Qwen 2.5 72B': 'Qwen 2.5 72B',
  'OR: Mistral Large': 'Mistral Large',
  'OR: Mistral Small': 'Mistral Small',
  'OR: GPT-4o-mini': 'GPT-4o-mini',
};

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; model: string; conversationId: string }
  | { type: 'error'; message: string };

