import { Intent, INTENT_CONFIG, INTENT_MODEL_LABELS } from '../../types';

const MODEL_COLORS: Record<string, string> = {
  'groq-compound': 'bg-orange-500/20 text-orange-300',
  'groq-chat': 'bg-orange-500/20 text-orange-300',
  nvidia: 'bg-green-500/20 text-green-300',
  gemini: 'bg-blue-500/20 text-blue-300',
  openrouter: 'bg-purple-500/20 text-purple-300',
};

const INTENT_TO_PROVIDER: Record<Intent, string> = {
  [Intent.WEB_SEARCH]: 'gemini',
  [Intent.CODING]: 'nvidia',
  [Intent.DEBUGGING]: 'groq-chat',
  [Intent.TRANSLATING]: 'openrouter',
  [Intent.DRAFTING]: 'groq-chat',
  [Intent.SUMMARIZING]: 'gemini',
  [Intent.IMAGE_ANALYSIS]: 'gemini',
};

interface Props {
  model: string | null;
  intent?: Intent | null;
}

export default function ModelBadge({ model, intent }: Props) {
  if (!model) return null;

  const label = INTENT_MODEL_LABELS[model] ?? model;
  const color = MODEL_COLORS[model] ?? 'bg-slate-500/20 text-slate-300';

  // Resolve intent icon: prefer passed intent, fall back by matching model to provider
  const resolvedIntent =
    intent ??
    (Object.entries(INTENT_TO_PROVIDER).find(([, provider]) => provider === model)?.[0] as Intent | undefined);

  const icon = resolvedIntent ? INTENT_CONFIG[resolvedIntent]?.icon : null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
      {icon && <span className="text-xs leading-none">{icon}</span>}
      {label}
    </span>
  );
}
