import { useState } from 'react';
import { ArrowLeft, Trash2, MessageSquare, Check, Pencil, X, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ProjectDetail as ProjectDetailType, Conversation, ProjectDownloadEntry } from '../../types';
import ContextEditor from './ContextEditor';
import { useFileDownload } from '../../hooks/useFileDownload';

interface Props {
  project: ProjectDetailType;
  onBack: () => void;
  onDelete: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: (projectId: string) => void;
  onUpdateName: (name: string) => void;
  onUpdateDescription: (description: string) => void;
  onUpdateContext: (content: string) => void;
  isSavingContext?: boolean;
}

type Tab = 'context' | 'conversations' | 'downloads';

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className={`group flex items-start gap-1.5 text-left hover:opacity-80 transition-opacity ${className ?? ''}`}
      >
        <span>{value || <span className="text-[#93a1a1] dark:text-slate-600 italic">{placeholder}</span>}</span>
        <Pencil size={13} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-[#93a1a1] dark:text-slate-500 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      {multiline ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          rows={2}
          className={`flex-1 bg-[#e0d8c4] dark:bg-slate-800 border border-[#b8b09e] dark:border-slate-600 rounded px-2 py-1 text-sm text-[#073642] dark:text-white focus:outline-none focus:border-indigo-500 ${className ?? ''}`}
        />
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className={`flex-1 bg-[#e0d8c4] dark:bg-slate-800 border border-[#b8b09e] dark:border-slate-600 rounded px-2 py-1 text-sm text-[#073642] dark:text-white focus:outline-none focus:border-indigo-500 ${className ?? ''}`}
        />
      )}
      <button onClick={commit} className="p-1 rounded hover:bg-[#d1c9b5] dark:hover:bg-slate-700 text-indigo-500 dark:text-indigo-400" aria-label="Save">
        <Check size={14} />
      </button>
      <button onClick={() => setEditing(false)} className="p-1 rounded hover:bg-[#d1c9b5] dark:hover:bg-slate-700 text-[#93a1a1] dark:text-slate-500" aria-label="Cancel">
        <X size={14} />
      </button>
    </div>
  );
}

function DownloadsList({ projectId }: { projectId: string }) {
  const { download } = useFileDownload();
  const { data: downloads, isLoading } = useQuery<ProjectDownloadEntry[]>({
    queryKey: ['project-downloads', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/downloads`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load downloads');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-[#e0d8c4] dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!downloads || downloads.length === 0) {
    return (
      <p className="text-sm text-[#93a1a1] dark:text-slate-600 py-8 text-center">
        No files generated yet. Ask the AI to create something in any conversation in this project.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-[#073642] dark:text-slate-300 mb-2">
        Downloads ({downloads.length} {downloads.length === 1 ? 'file' : 'files'})
      </p>
      {downloads.map((dl) => (
        <button
          key={`${dl.conversationId}-${dl.fileId}`}
          onClick={() => download(dl.conversationId, dl.fileId, dl.filename)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-left transition-colors border border-[#ccc5af]/50 dark:border-slate-700/50"
        >
          <Download size={14} className="shrink-0 text-indigo-500 dark:text-indigo-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#073642] dark:text-white truncate">{dl.filename}</p>
            <p className="text-xs text-[#93a1a1] dark:text-slate-500 truncate">
              From: "{dl.conversationTitle}"
              {dl.created_at && ` · ${formatDate(dl.created_at)}`}
              {dl.size !== undefined && ` · ${formatBytes(dl.size)}`}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ProjectDetail({
  project,
  onBack,
  onDelete,
  onSelectConversation,
  onNewChat,
  onUpdateName,
  onUpdateDescription,
  onUpdateContext,
  isSavingContext,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('conversations');

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 bg-[#fdf6e3] dark:bg-slate-950 border-b border-[#ccc5af] dark:border-slate-800 px-4 py-3 flex items-center gap-3 z-10">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#586e75] dark:text-slate-400 hover:text-[#073642] dark:hover:text-white transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm text-[#93a1a1] dark:text-slate-500 font-medium">Project</span>
      </div>

      <div className="p-6 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col gap-1.5">
          <InlineEdit
            value={project.name}
            onSave={onUpdateName}
            className="text-xl font-semibold text-[#073642] dark:text-white"
            placeholder="Project name"
          />
          <InlineEdit
            value={project.description}
            onSave={onUpdateDescription}
            className="text-sm text-[#586e75] dark:text-slate-400"
            placeholder="Add a description..."
            multiline
          />
        </div>

        {/* AI Summary */}
        {project.summary && (
          <div className="bg-[#eee8d5] dark:bg-slate-900 border border-[#ccc5af] dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs font-medium text-[#93a1a1] dark:text-slate-500 uppercase tracking-wider mb-2">AI Summary</p>
            <p className="text-sm text-[#073642] dark:text-slate-300 leading-relaxed">{project.summary}</p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-[#ccc5af] dark:border-slate-800">
          {(['conversations', 'context', 'downloads'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-[#93a1a1] dark:text-slate-500 hover:text-[#073642] dark:hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'context' && (
          <ContextEditor
            projectId={project.id}
            initialContent={project.contextDoc}
            onSave={onUpdateContext}
            isSaving={isSavingContext}
          />
        )}

        {activeTab === 'conversations' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-[#073642] dark:text-slate-300">
                Conversations ({project.conversations.length})
              </p>
              <button
                onClick={() => onNewChat(project.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                <MessageSquare size={12} />
                New Chat
              </button>
            </div>

            {project.conversations.length === 0 ? (
              <p className="text-sm text-[#93a1a1] dark:text-slate-600 py-4 text-center">No conversations yet</p>
            ) : (
              <div className="flex flex-col gap-1">
                {(project.conversations as Conversation[]).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => onSelectConversation(conv.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-left transition-colors"
                  >
                    <MessageSquare size={14} className="shrink-0 text-[#93a1a1] dark:text-slate-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#073642] dark:text-white truncate">{conv.title}</p>
                      <p className="text-xs text-[#93a1a1] dark:text-slate-500">{formatDate(conv.updated_at)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'downloads' && (
          <DownloadsList projectId={project.id} />
        )}

        {/* Danger zone */}
        <div className="border border-red-200/70 dark:border-red-900/30 rounded-lg p-4">
          <p className="text-xs font-medium text-[#93a1a1] dark:text-slate-500 uppercase tracking-wider mb-2">Danger Zone</p>
          <p className="text-xs text-[#93a1a1] dark:text-slate-500 mb-3">
            Deleting this project removes the project and its context, but keeps all conversations (they become ungrouped).
          </p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={12} />
              Delete project
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500 dark:text-red-400">Are you sure?</span>
              <button
                onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-xs text-[#586e75] dark:text-slate-400 hover:text-[#073642] dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
