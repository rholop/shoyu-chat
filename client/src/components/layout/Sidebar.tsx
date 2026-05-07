import { useState, useEffect } from 'react';
import { Trash2, MessageSquare, PanelLeftClose, Plus, CheckSquare } from 'lucide-react';
import { Conversation, Project } from '../../types';
import ModelBadge from '../chat/ModelBadge';
import ProjectList from '../projects/ProjectList';
import { ProjectSuggestionBanner } from '../suggestions/ProjectSuggestionBanner';
import { useTodos } from '../../hooks/useTodos';
import { useChatStore } from '../../store/chatStore';

interface Props {
  conversations: Conversation[];
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
  onSelectProject: (id: string) => void;
  onNewChatInProject: (projectId: string) => void;
  onCreateProject: () => void;
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

export default function Sidebar({
  conversations,
  projects,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
  onClose,
  onSelectProject,
  onNewChatInProject,
  onCreateProject,
}: Props) {
  const ungrouped = conversations.filter((c) => !c.projectId);
  const { data: todos = [] } = useTodos();
  const nowCount = todos.filter(t => t.status === 'open' && t.priority === 'now').length;
  const setTodoCount = useChatStore((state) => state.setTodoCount);

  useEffect(() => {
    setTodoCount(nowCount);
  }, [nowCount, setTodoCount]);

  return (
    <aside className="flex flex-col h-full w-72 bg-[#eee8d5] dark:bg-slate-900 border-r border-[#ccc5af] dark:border-slate-800">
      <div className="px-3 pb-3 pt-safe border-b border-[#ccc5af] dark:border-slate-800 flex gap-2">
        <button
          onClick={onNewChat}
          className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <MessageSquare size={16} />
          New Chat
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="hidden md:flex p-2 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#586e75] dark:text-slate-400 hover:text-[#073642] dark:hover:text-white transition-colors items-center justify-center"
            aria-label="Close sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto pt-2 pb-safe">
        <div className="px-2 mb-4">
          <button
            onClick={() => onSelect('todos')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
              activeId === 'todos'
                ? 'bg-[#d1c9b5] dark:bg-slate-700 text-[#073642] dark:text-white'
                : 'hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#586e75] dark:text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckSquare size={18} />
              <span className="text-sm font-medium">To-Dos</span>
            </div>
            {nowCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {nowCount > 9 ? '9+' : nowCount}
              </span>
            )}
          </button>
        </div>

        <ProjectSuggestionBanner />

        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-xs font-semibold text-[#93a1a1] dark:text-slate-500 uppercase tracking-wider">Projects</span>
          <button
            onClick={onCreateProject}
            className="p-0.5 rounded hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#93a1a1] dark:text-slate-500 hover:text-[#586e75] dark:hover:text-slate-300 transition-colors"
            aria-label="New project"
          >
            <Plus size={13} />
          </button>
        </div>

        {projects.length > 0 && (
          <ProjectList
            projects={projects}
            conversations={conversations}
            activeConversationId={activeId}
            onSelectProject={onSelectProject}
            onSelectConversation={onSelect}
            onNewChatInProject={onNewChatInProject}
            onDeleteConversation={onDelete}
            onCreateProject={onCreateProject}
          />
        )}

        {ungrouped.length > 0 && (
          <>
            {projects.length > 0 && (
              <div className="px-3 py-1.5">
                <span className="text-xs font-semibold text-[#93a1a1] dark:text-slate-500 uppercase tracking-wider">Conversations</span>
              </div>
            )}
            {ungrouped.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors ${
                  activeId === conv.id
                    ? 'bg-[#d1c9b5] dark:bg-slate-700'
                    : 'hover:bg-[#e0d8c4] dark:hover:bg-slate-800'
                }`}
                onClick={() => onSelect(conv.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#073642] dark:text-white truncate flex items-center gap-1.5">
                    {conv.resolved === false && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500" title="Unresolved" />
                    )}
                    {conv.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-[#93a1a1] dark:text-slate-500">{formatDate(conv.updated_at)}</span>
                    <ModelBadge model={conv.model_last_used} />
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  className="shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-900/50 text-[#93a1a1] dark:text-slate-500 hover:text-red-400 transition-all"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </>
        )}

        {conversations.length === 0 && projects.length === 0 && (
          <p className="text-[#93a1a1] dark:text-slate-500 text-xs text-center py-8 px-4">No conversations yet</p>
        )}
      </nav>
    </aside>
  );
}
