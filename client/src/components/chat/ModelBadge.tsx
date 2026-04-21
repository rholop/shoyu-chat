const MODEL_LABELS: Record<string, string> = {
  'groq-chat': 'Groq',
  'groq-summary': 'Groq',
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
};

const MODEL_COLORS: Record<string, string> = {
  'groq-chat': 'bg-orange-500/20 text-orange-300',
  gemini: 'bg-blue-500/20 text-blue-300',
  openrouter: 'bg-purple-500/20 text-purple-300',
};

interface Props {
  model: string | null;
}

export default function ModelBadge({ model }: Props) {
  if (!model) return null;
  const label = MODEL_LABELS[model] ?? model;
  const color = MODEL_COLORS[model] ?? 'bg-slate-500/20 text-slate-300';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>{label}</span>
  );
}
