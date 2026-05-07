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

export interface MessageDownload {
  fileId: string;
  filename: string;
  description?: string;
  version: number;
  updated?: boolean;
  size?: number;
  created_at?: string;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: 'user' | 'assistant' | 'internal';
  content: string;
  model_used: string | null;
  intent?: Intent | null;
  attachments?: Attachment[];
  downloads?: MessageDownload[];
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
  resolved?: boolean | null;
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

export interface ProjectDownloadEntry extends MessageDownload {
  conversationId: string;
  conversationTitle: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

export interface SimilarMatch {
  conversationId: string;
  title: string;
  goal: string;
  date: string;
  resolved: boolean | null;
  score: number;
  topics: string[];
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
  gemini: 'Gemini 2.5 Flash',
  nvidia: 'Llama 3.3 70B',
  'groq-chat': 'Llama 3.3 70B',
  'groq-compound': 'Groq⚡',
  openrouter: 'OR',
  'Gemini: 2.5 Flash': 'Gemini 2.5 Flash',
  'Gemini: 2.5 Pro': 'Gemini 2.5 Pro',
  'NVIDIA: Llama 3.3 70B': 'Llama 3.3 70B',
  'NVIDIA: Llama 3.1 70B': 'Llama 3.1 70B',
  'Groq: Llama 3.3 70B': 'Llama 3.3 70B',
  'OR: GPT-oss-120b': 'GPT-oss-120b',
  'OR: Laguna M.1': 'Laguna M.1',
  'OR: Llama 3.2 3B': 'Llama 3.2 3B',
  'OR: Perplexity Sonar Pro': 'Perplexity Sonar Pro',
};

export type SSEEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; model: string; conversationId: string; intent: Intent; downloads?: MessageDownload[] }
  | { type: 'error'; message: string };

export type TodoPriority = 'now' | 'soon' | 'someday';
export type TodoStatus = 'open' | 'done' | 'snoozed';

export interface Todo {
  id: string;
  conversationId: string;
  text: string;
  priority: TodoPriority;
  status: TodoStatus;
  projectId: string | null;
  projectName: string | null;
  intent: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  snoozedUntil: string | null;
  sourceMessageHint: string;
}

export interface ProjectSuggestion {
  topic: string;
  conversationCount: number;
  weekCount: number;
  firstSeen: string;
  lastSeen: string;
  relatedGoals: string[];
  relatedConversationIds: string[];
}

export interface OpenLoop {
  conversationId: string;
  title: string;
  goal: string;                  // one-liner from topic ledger
  projectId: string | null;
  projectName: string | null;
  intent: string;
  topics: string[];
  createdAt: string;
  summarizedAt: string;          // when the summary system last ran
  daysSinceCreated: number;      // computed at query time
  snoozedUntil: string | null;   // stored in meta.json
}
