export interface LedgerEntry {
  date: string;
  conversationId: string;
  topics: string[];
  goal: string;
  intent: string;
  projectId: string | null;
  projectName: string | null;
  model: string;
  messageCount: number;
  resolved: boolean | null;
}

export interface TopicFrequency {
  topic: string;
  count: number;
}

export interface IntentFrequency {
  intent: string;
  count: number;
  percentage: number;
}

export interface TopicSeries {
  topic: string;
  weekCount: number;
  firstSeen: string;
  lastSeen: string;
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

export interface RollingWeek {
  week: string;           // e.g. "2026-W16"
  conversationCount: number;
  topTopics: string[];    // top 3
  intents: string[];      // unique intents used
  hadUnresolved: boolean;
}

export interface PatternReport {
  generatedAt: string; // ISO timestamp

  allTime: {
    topTopics: TopicFrequency[]; // top 10 topics by count, all time
    topIntents: IntentFrequency[]; // intent distribution, all time
    totalConversations: number;
    totalMessages: number;
    mostActiveProject: string | null; // projectName with most conversations
    topicsWithoutProject: string[]; // top 5 topics never tied to a project
  };

  last4Weeks: {
    topTopics: TopicFrequency[]; // top 10 topics in last 28 days
    topIntents: IntentFrequency[]; // intent distribution in last 28 days
    newTopics: string[]; // topics appearing for first time in last 4 weeks
    returningTopics: string[]; // topics seen before + again in last 4 weeks
    weeklyConversationCounts: { week: string; count: number }[]; // last 4 weeks
  };

  recurring: {
    topicsSeenMultipleWeeks: TopicSeries[]; // topics appearing in 3+ different weeks
    longestRunningTopic: string | null; // topic seen across most distinct weeks
  };
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

export const INTENT_LABELS: Record<Intent, string> = {
  [Intent.WEB_SEARCH]: 'Web Search',
  [Intent.CODING]: 'Coding',
  [Intent.DEBUGGING]: 'Debugging',
  [Intent.TRANSLATING]: 'Translating',
  [Intent.DRAFTING]: 'Drafting',
  [Intent.SUMMARIZING]: 'Summarizing',
  [Intent.IMAGE_ANALYSIS]: 'Image Analysis',
};

export const INTENT_ICONS: Record<Intent, string> = {
  [Intent.WEB_SEARCH]: '🌐',
  [Intent.CODING]: '💻',
  [Intent.DEBUGGING]: '🐞',
  [Intent.TRANSLATING]: '文',
  [Intent.DRAFTING]: '✍️',
  [Intent.SUMMARIZING]: '📝',
  [Intent.IMAGE_ANALYSIS]: '👁️',
};

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
