import { useState } from 'react';
import { FolderOpen, ChevronDown, ChevronRight, MessageSquare, Trash2 } from 'lucide-react';
import { Project, Conversation } from '../../types';

interface Props {
  projects: Project[];
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectProject: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onNewChatInProject: (projectId: string) => void;
  onDeleteConversation: (id: string) => void;
  onCreateProject: () => void;
}

export default function ProjectList({
  projects,
  conversations,
  activeConversationId,
  onSelectProject,
  onSelectConversation,
  onNewChatInProject,
  onDeleteConversation,
  onCreateProject,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  if (projects.length === 0) return null;

  return (
    <div className="mb-1">
      {projects.map((project) => {
        const projectConversations = conversations.filter((c) => c.projectId === project.id);
        const isCollapsed = collapsed[project.id];

        return (
          <div key={project.id} className="mb-0.5">
            <div className="group flex items-center gap-1 px-3 py-1.5 mx-1 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors">
              <button
                onClick={() => toggle(project.id)}
                className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                onClick={() => onSelectProject(project.id)}
              >
                <FolderOpen size={14} className="shrink-0 text-indigo-400" />
                <span className="text-sm text-slate-200 truncate font-medium">{project.name}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onNewChatInProject(project.id); }}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-all"
                aria-label="New chat in project"
              >
                <MessageSquare size={12} />
              </button>
            </div>

            {!isCollapsed && (
              <div className="ml-4 border-l border-slate-800 pl-2">
                {projectConversations.length === 0 ? (
                  <p className="text-xs text-slate-600 px-2 py-1.5">No conversations yet</p>
                ) : (
                  projectConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        activeConversationId === conv.id ? 'bg-slate-700' : 'hover:bg-slate-800'
                      }`}
                      onClick={() => onSelectConversation(conv.id)}
                    >
                      <p className="flex-1 text-xs text-slate-300 truncate">{conv.title}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-900/50 text-slate-500 hover:text-red-400 transition-all"
                        aria-label="Delete conversation"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
