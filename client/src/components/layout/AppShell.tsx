import { useState, useEffect } from 'react';
import { useConversations } from '../../hooks/useConversations';
import { useProjects, useProject } from '../../hooks/useProjects';
import { useChatStore } from '../../store/chatStore';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { SearchPalette } from '../search/SearchPalette';

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


export default function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const { conversations, create, remove, refresh } = useConversations();
  const { projects, create: createProject } = useProjects();
  const { activeConversationId, setActiveConversation } = useChatStore();

  const getActiveId = () => {
    if (location.pathname.startsWith('/chat/todos')) return 'todos';
    if (location.pathname.startsWith('/chat/')) return location.pathname.split('/chat/')[1];
    if (location.pathname.startsWith('/projects/')) return location.pathname.split('/projects/')[1];
    return activeConversationId;
  };

  const activeId = getActiveId();

  const getTitle = () => {
    if (location.pathname.startsWith('/chat/todos')) return 'To-Dos';
    if (location.pathname.startsWith('/projects/')) {
      const id = location.pathname.split('/projects/')[1];
      return projects.find((p) => p.id === id)?.name ?? 'Project';
    }
    const conv = conversations.find((c) => c.id === activeConversationId);
    return conv?.title ?? 'Shoyu Chat';
  };

  const title = getTitle();

  const handleNewChat = async (projectId?: string) => {
    const { id } = await create(projectId ? { projectId } : undefined);
    setActiveConversation(id);
    navigate(`/chat/${id}`);
    setMobileSidebarOpen(false);
    refresh();
  };

  const handleSelect = (id: string) => {
    if (id === 'todos') {
      navigate('/chat/todos');
    } else {
      setActiveConversation(id);
      navigate(`/chat/${id}`);
    }
    setMobileSidebarOpen(false);
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (activeConversationId === id) setActiveConversation(null);
  };

  const handleSelectProject = (id: string) => {
    navigate(`/projects/${id}`);
    setMobileSidebarOpen(false);
  };

  const handleCreateProject = async (name: string, desc: string) => {
    const res = await createProject({ name, description: desc });
    const id = res.id;
    setShowNewProjectModal(false);
    navigate(`/projects/${id}`);
  };

  // Auto-select first conversation on first load
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, setActiveConversation]);

  // Global Cmd/Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSearchSelectConversation = (conversationId: string) => {
    setActiveConversation(conversationId);
    navigate(`/chat/${conversationId}`);
    setMobileSidebarOpen(false);
  };

  const handleSearchSelectProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
    setMobileSidebarOpen(false);
  };

  const activeProjectId = location.pathname.startsWith('/projects/')
    ? location.pathname.split('/projects/')[1]
    : undefined;

  return (
    <div className="flex h-[100dvh] bg-[#fdf6e3] dark:bg-slate-950 overflow-hidden">
      <SearchPalette
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        projectId={activeProjectId}
        onSelectConversation={handleSearchSelectConversation}
        onSelectProject={handleSearchSelectProject}
      />
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
          activeId={activeId}
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
          onOpenSearch={() => setSearchOpen(true)}
          desktopSidebarOpen={desktopSidebarOpen}
          onDesktopSidebarOpen={() => setDesktopSidebarOpen(true)}
        />

        <Outlet context={{ onMenuToggle: () => setMobileSidebarOpen(v => !v), onNewChat: handleNewChat }} />
      </div>
    </div>
  );
}
