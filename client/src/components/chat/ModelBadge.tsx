import { Intent, INTENT_CONFIG, INTENT_MODEL_LABELS } from '../../types';

const MODEL_COLORS: Record<string, string> = {
  'groq-compound': 'bg-orange-500/20 text-orange-300',
  'groq-chat': 'bg-orange-500/20 text-orange-300',
  'Groq: Llama 3.3 70B': 'bg-orange-500/20 text-orange-300',
  nvidia: 'bg-green-500/20 text-green-300',
  'NVIDIA: Llama 3.3 70B': 'bg-green-500/20 text-green-300',
  'NVIDIA: Llama 3.1 70B': 'bg-green-500/20 text-green-300',
  gemini: 'bg-blue-500/20 text-blue-300',
  'Gemini: 2.5 Flash': 'bg-blue-500/20 text-blue-300',
  'Gemini: 2.5 Pro': 'bg-blue-500/20 text-blue-300',
  openrouter: 'bg-purple-500/20 text-purple-300',
  'OR: GPT-oss-120b': 'bg-purple-500/20 text-purple-300',
  'OR: Laguna M.1': 'bg-purple-500/20 text-purple-300',
  'OR: Llama 3.2 3B': 'bg-purple-500/20 text-purple-300',
  'OR: Perplexity Sonar Pro': 'bg-purple-500/20 text-purple-300',
};

// Used only as a fallback when intent is not available (e.g. historical messages).
// Checked in insertion order — first match wins.
const INTENT_TO_PROVIDER: Record<Intent, string[]> = {
  [Intent.CODING]: ['NVIDIA:', 'Groq:'],
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
  const color = MODEL_COLORS[cleanModelName] ?? 'bg-slate-500/20 text-slate-300';

  // Resolve intent icon: prefer passed intent, fall back by matching model to provider
  const resolvedIntent =
    intent ??
    (Object.entries(INTENT_TO_PROVIDER).find(([, providers]) =>
      providers.some((p) => cleanModelName.startsWith(p)),
    )?.[0] as Intent | undefined);

  const icon = resolvedIntent ? INTENT_CONFIG[resolvedIntent]?.icon : null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
      {icon && <span className="text-xs leading-none">{icon}</span>}
      {label}
      {isFallback && <span className="opacity-70 text-[10px] ml-0.5">(Fallback)</span>}
    </span>
  );
}
