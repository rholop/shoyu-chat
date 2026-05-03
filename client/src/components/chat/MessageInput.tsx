import { useState, useRef, KeyboardEvent, DragEvent } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { Attachment, Intent, INTENT_CONFIG } from '../../types';
import { useChatStore } from '../../store/chatStore';
import AttachmentChip from './AttachmentChip';

const INTENTS = Object.values(Intent);

interface Props {
  onSend: (content: string, attachments: Attachment[]) => void;
  onFilesDrop?: (files: FileList) => void;
  onFilesSelect?: (files: FileList) => void;
  attachments?: Attachment[];
  onRemoveAttachment?: (fileId: string) => void;
  uploading?: boolean;
  disabled?: boolean;
}

export default function MessageInput({
  onSend,
  onFilesDrop,
  onFilesSelect,
  attachments = [],
  onRemoveAttachment,
  uploading,
  disabled,
}: Props) {
  const [value, setValue] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedIntent, intentLocked, setIntent } = useChatStore();

  const submit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled || uploading) return;
    onSend(trimmed, attachments);
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

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0 && onFilesDrop) {
      onFilesDrop(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFilesSelect) {
      onFilesSelect(e.target.files);
    }
    e.target.value = '';
  };

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled && !uploading;

  return (
    <div
      className={`border-t border-[#ccc5af] dark:border-slate-800 bg-[#fdf6e3] dark:bg-slate-950 p-3 pb-safe transition-colors ${isDragOver ? 'bg-indigo-50/50 dark:bg-indigo-950/30' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-3xl mx-auto">
        {/* Intent task bar */}
        <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-0.5 scrollbar-none">
          {INTENTS.map((intent) => {
            const { icon, label } = INTENT_CONFIG[intent];
            const isActive = selectedIntent === intent;
            return (
              <button
                key={intent}
                type="button"
                onClick={() => setIntent(intent)}
                disabled={disabled}
                title={intentLocked && isActive ? `${label} (locked)` : label}
                aria-label={label}
                aria-pressed={isActive}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-default
                  ${isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                  }`}
              >
                <span className="text-sm leading-none">{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
          {/* Auto-detect indicator */}
          {!intentLocked && (
            <span
              className="shrink-0 ml-auto text-[10px] text-slate-600 font-mono whitespace-nowrap"
              title="Intent is detected automatically from your message"
            >
              auto
            </span>
          )}
        </div>

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.fileId}
                attachment={att}
                onRemove={onRemoveAttachment ? () => onRemoveAttachment(att.fileId) : undefined}
              />
            ))}
          </div>
        )}

        {isDragOver && (
          <div className="flex items-center justify-center h-10 mb-2 text-sm text-indigo-500 dark:text-indigo-400 border border-dashed border-indigo-400 dark:border-indigo-600 rounded-lg">
            Drop files to attach
          </div>
        )}

        <div className="flex items-end gap-2 bg-[#e0d8c4] dark:bg-slate-800 rounded-2xl px-4 py-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept={[
              'image/jpeg', 'image/png', 'image/gif', 'image/webp',
              'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
              'application/json', 'text/javascript', 'text/typescript', 'text/html', 'text/css',
            ].join(',')}
          />

          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="shrink-0 p-1 rounded-lg text-[#93a1a1] dark:text-slate-500 hover:text-[#586e75] dark:hover:text-slate-300 hover:bg-[#d1c9b5] dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-default transition-colors mb-0.5"
            aria-label="Attach file"
          >
            {uploading ? (
              <span className="w-4 h-4 border border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />
            ) : (
              <Paperclip size={16} />
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            placeholder={uploading ? 'Uploading…' : `${INTENT_CONFIG[selectedIntent].icon} ${INTENT_CONFIG[selectedIntent].description}…`}
            className="flex-1 bg-transparent text-[#073642] dark:text-white placeholder-[#93a1a1] dark:placeholder-slate-500 text-sm resize-none focus:outline-none py-1.5 max-h-[200px]"
          />

          <button
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-default transition-colors mb-0.5"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>
        <p className="text-xs text-[#93a1a1] dark:text-slate-600 text-center mt-1.5">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
