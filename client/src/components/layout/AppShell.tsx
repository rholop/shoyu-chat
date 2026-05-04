import { useState, useEffect } from 'react';
import { useConversations } from '../../hooks/useConversations';
import { useProjects, useProject } from '../../hooks/useProjects';
import { useChatStore } from '../../store/chatStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ChatView from '../chat/ChatView';
import ProjectDetail from '../projects/ProjectDetail';
import { SearchPalette } from '../search/SearchPalette';

type ActiveView = { type: 'chat' } | { type: 'project'; projectId: string };

function NewProjectModal({ onCreate, onClose }: { onCreate: (name: string, desc: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#eee8d5] dark:bg-slate-900 border border-[#b8b09e] dark:border-slate-700 rounded-xl w-full max-w-md p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-[#073642] dark:text-white">New Project</h2>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[#586e75] dark:text-slate-400">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim(), desc); if (e.key === 'Escape') onClose(); }}
            placeholder="Project name"
            className="bg-[#e0d8c4] dark:bg-slate-800 border border-[#b8b09e] dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-[#073642] dark:text-white placeholder-[#93a1a1] dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[#586e75] dark:text-slate-400">Description (optional)</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this project about?"
            rows={2}
            className="bg-[#e0d8c4] dark:bg-slate-800 border border-[#b8b09e] dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-[#073642] dark:text-white placeholder-[#93a1a1] dark:placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#586e75] dark:text-slate-400 hover:text-[#073642] dark:hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (name.trim()) onCreate(name.trim(), desc); }}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectDetailView({
  projectId,
  onBack,
  onSelectConversation,
  onNewChat,
}: {
  projectId: string;
  onBack: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: (projectId: string) => void;
}) {
  const { project, updateContext } = useProject(projectId);
  const { update } = useProjects();

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <ProjectDetail
        project={project}
        onBack={onBack}
        onDelete={() => { onBack(); }}
        onSelectConversation={(id) => { onSelectConversation(id); onBack(); }}
        onNewChat={onNewChat}
        onUpdateName={(name) => update(projectId, { name })}
        onUpdateDescription={(description) => update(projectId, { description })}
        onUpdateContext={updateContext}
      />
    </div>
  );
}

export default function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'chat' });
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const { conversations, create, remove, refresh } = useConversations();
  const { projects, create: createProject } = useProjects();
  const { activeConversationId, setActiveConversation } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const title =
    activeView.type === 'project'
      ? (projects.find((p) => p.id === activeView.projectId)?.name ?? 'Project')
      : (activeConversation?.title ?? 'Shoyu Chat');

  const handleNewChat = async (projectId?: string) => {
    const { id } = await create(projectId ? { projectId } : undefined);
    setActiveConversation(id);
    setActiveView({ type: 'chat' });
    setMobileSidebarOpen(false);
    refresh();
  };

  const handleSelect = (id: string) => {
    setActiveConversation(id);
    setActiveView({ type: 'chat' });
    setMobileSidebarOpen(false);
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (activeConversationId === id) setActiveConversation(null);
  };

  const handleSelectProject = (id: string) => {
    setActiveView({ type: 'project', projectId: id });
    setMobileSidebarOpen(false);
  };

  const handleCreateProject = async (name: string, desc: string) => {
    const { id } = await createProject({ name, description: desc });
    setShowNewProjectModal(false);
    setActiveView({ type: 'project', projectId: id });
  };

  // Auto-select first conversation on first load
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, setActiveConversation]);

  return (
    <div className="flex h-[100dvh] bg-[#fdf6e3] dark:bg-slate-950 overflow-hidden">
      <SearchPalette />
      {showNewProjectModal && (
        <NewProjectModal
          onCreate={handleCreateProject}
          onClose={() => setShowNewProjectModal(false)}
        />
      )}

      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-200 md:relative md:z-auto md:shrink-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${desktopSidebarOpen ? 'md:block' : 'md:hidden'}`}
      >
        <Sidebar
          conversations={conversations}
          projects={projects}
          activeId={activeConversationId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onNewChat={() => handleNewChat()}
          onClose={() => setDesktopSidebarOpen(false)}
          onSelectProject={handleSelectProject}
          onNewChatInProject={(projectId) => handleNewChat(projectId)}
          onCreateProject={() => setShowNewProjectModal(true)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={title}
          onMenuToggle={() => setMobileSidebarOpen((v) => !v)}
          onNewChat={() => handleNewChat()}
          desktopSidebarOpen={desktopSidebarOpen}
          onDesktopSidebarOpen={() => setDesktopSidebarOpen(true)}
        />

        {activeView.type === 'project' ? (
          <ProjectDetailView
            projectId={activeView.projectId}
            onBack={() => setActiveView({ type: 'chat' })}
            onSelectConversation={handleSelect}
            onNewChat={(projectId) => handleNewChat(projectId)}
          />
        ) : activeConversationId ? (
          <ChatView
            conversationId={activeConversationId}
            title={title}
            onMenuToggle={() => setMobileSidebarOpen((v) => !v)}
            onNewChat={() => handleNewChat()}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <p className="text-[#586e75] dark:text-slate-400 text-lg mb-2">Welcome to Shoyu Chat</p>
            <p className="text-[#93a1a1] dark:text-slate-600 text-sm mb-6">Start a new conversation to begin</p>
            <button
              onClick={() => handleNewChat()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              New Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
