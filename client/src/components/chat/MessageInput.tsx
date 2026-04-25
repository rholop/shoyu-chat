import { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  return (
    <div className="border-t border-slate-800 bg-slate-950 p-3 pb-safe">
      <div className="max-w-3xl mx-auto">
      <div className="flex items-end gap-2 bg-slate-800 rounded-2xl px-4 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Message…"
          className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm resize-none focus:outline-none py-1.5 max-h-[200px]"
        />
        <button
          onClick={submit}
          disabled={!value.trim() || disabled}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-default transition-colors mb-0.5"
        >
          <Send size={14} className="text-white" />
        </button>
      </div>
      <p className="text-xs text-slate-600 text-center mt-1.5">
        Enter to send · Shift+Enter for newline
      </p>
      </div>
    </div>
  );
}
