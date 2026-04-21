import { Trash2, MessageSquare } from 'lucide-react';
import { Conversation } from '../../types';
import ModelBadge from '../chat/ModelBadge';

interface Props {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onNewChat: () => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Sidebar({ conversations, activeId, onSelect, onDelete, onNewChat }: Props) {
  return (
    <aside className="flex flex-col h-full w-72 bg-slate-900 border-r border-slate-800">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <MessageSquare size={16} />
          New Chat
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-8 px-4">No conversations yet</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors ${
              activeId === conv.id ? 'bg-slate-700' : 'hover:bg-slate-800'
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{conv.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-slate-500">{formatDate(conv.updated_at)}</span>
                <ModelBadge model={conv.model_last_used} />
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-900/50 text-slate-500 hover:text-red-400 transition-all"
              aria-label="Delete conversation"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
