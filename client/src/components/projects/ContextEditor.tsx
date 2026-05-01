import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';

interface Props {
  projectId: string;
  initialContent: string;
  onSave: (content: string) => void;
  isSaving?: boolean;
}

export default function ContextEditor({ initialContent, onSave, isSaving }: Props) {
  const [content, setContent] = useState(initialContent);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setDirty(false);
  }, [initialContent]);

  const handleChange = (value: string) => {
    setContent(value);
    setDirty(value !== initialContent);
  };

  const handleSave = () => {
    onSave(content);
    setDirty(false);
  };

  const handleDiscard = () => {
    setContent(initialContent);
    setDirty(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-300">Project Context</label>
        {dirty && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors"
            >
              <X size={12} />
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              <Save size={12} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        rows={12}
        placeholder="Write project context here — this will be injected as a system prompt into every AI conversation in this project."
        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 font-mono resize-y focus:outline-none focus:border-indigo-500 transition-colors"
      />
      <p className="text-xs text-slate-600">
        This context is invisible in the chat UI — it&apos;s background knowledge injected automatically into every AI call.
      </p>
    </div>
  );
}
