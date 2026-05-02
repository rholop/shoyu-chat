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
