import { Intent, INTENT_CONFIG, INTENT_MODEL_LABELS } from '../../types';

const MODEL_COLORS: Record<string, string> = {
  'groq-compound': 'bg-orange-100 text-orange-900 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-100 dark:border-orange-700/50',
  'groq-chat': 'bg-orange-100 text-orange-900 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-100 dark:border-orange-700/50',
  'Groq: Llama 3.3 70B': 'bg-orange-100 text-orange-900 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-100 dark:border-orange-700/50',
  nvidia: 'bg-green-100 text-green-900 border border-green-200 dark:bg-green-900/40 dark:text-green-100 dark:border-green-700/50',
  'NVIDIA: Llama 3.3 70B': 'bg-green-100 text-green-900 border border-green-200 dark:bg-green-900/40 dark:text-green-100 dark:border-green-700/50',
  'NVIDIA: Llama 3.1 70B': 'bg-green-100 text-green-900 border border-green-200 dark:bg-green-900/40 dark:text-green-100 dark:border-green-700/50',
  gemini: 'bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-700/50',
  'Gemini: 2.5 Flash': 'bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-700/50',
  'Gemini: 2.5 Pro': 'bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-700/50',
  openrouter: 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700/50',
  'OR: GPT-oss-120b': 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700/50',
  'OR: Laguna M.1': 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700/50',
  'OR: Llama 3.2 3B': 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700/50',
  'OR: Perplexity Sonar Pro': 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-100 dark:border-purple-700/50',
};

// Used only as a fallback when intent is not available (e.g. historical messages).
// Checked in insertion order — first match wins.
const INTENT_TO_PROVIDER: Record<Intent, string[]> = {
  [Intent.CODING]: ['NVIDIA:', 'nvidia', 'Groq:'],
  [Intent.DEBUGGING]: ['OR: Laguna'],
  [Intent.SUMMARIZING]: ['OR: Llama 3.2'],
  [Intent.DRAFTING]: ['Groq:', 'NVIDIA:'],
  [Intent.WEB_SEARCH]: ['Gemini:'],
  [Intent.TRANSLATING]: ['Groq:', 'Gemini:', 'OR:'],
  [Intent.IMAGE_ANALYSIS]: ['Gemini:'],
};

interface Props {
  model: string | null;
  intent?: Intent | null;
}

export default function ModelBadge({ model, intent }: Props) {
  if (!model) return null;

  // model might be "Gemini: 2.0 Flash (Fallback)"
  const cleanModelName = model.replace(' (Fallback)', '');
  const isFallback = model.includes('(Fallback)');

  const label = INTENT_MODEL_LABELS[cleanModelName] ?? cleanModelName;
  const color = MODEL_COLORS[cleanModelName] ?? 'bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-900/40 dark:text-slate-100 dark:border-slate-700/50';

  // Resolve intent icon: prefer passed intent, fall back by matching model to provider
  const resolvedIntent =
    intent ??
    (Object.entries(INTENT_TO_PROVIDER).find(([, providers]) =>
      providers.some((p) => cleanModelName.startsWith(p)),
    )?.[0] as Intent | undefined);

  const icon = resolvedIntent ? INTENT_CONFIG[resolvedIntent]?.icon : null;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-mono ${color}`}>
      {icon && <span className="text-[11px] leading-none">{icon}</span>}
      {label}
      {isFallback && <span className="opacity-70 text-[10px] ml-0.5">(Fallback)</span>}
    </span>
  );
}
