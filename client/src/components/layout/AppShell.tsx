import { useState, useEffect } from 'react';
import { useConversations } from '../../hooks/useConversations';
import { useChatStore } from '../../store/chatStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ChatView from '../chat/ChatView';

export default function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const { conversations, create, remove, refresh } = useConversations();
  const { activeConversationId, setActiveConversation } = useChatStore();

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const title = activeConversation?.title ?? 'Shoyu Chat';

  const handleNewChat = async () => {
    const { id } = await create();
    setActiveConversation(id);
    setMobileSidebarOpen(false);
    refresh();
  };

  const handleSelect = (id: string) => {
    setActiveConversation(id);
    setMobileSidebarOpen(false);
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (activeConversationId === id) setActiveConversation(null);
  };

  // Auto-select first conversation on first load
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, setActiveConversation]);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar — mobile: slide-over; desktop: persistent, collapsible */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-200 md:relative md:z-auto md:shrink-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${desktopSidebarOpen ? 'md:block' : 'md:hidden'}`}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onNewChat={handleNewChat}
          onClose={() => setDesktopSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={title}
          onMenuToggle={() => setMobileSidebarOpen((v) => !v)}
          onNewChat={handleNewChat}
          desktopSidebarOpen={desktopSidebarOpen}
          onDesktopSidebarOpen={() => setDesktopSidebarOpen(true)}
        />

        {activeConversationId ? (
          <ChatView conversationId={activeConversationId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <p className="text-slate-400 text-lg mb-2">Welcome to Shoyu Chat</p>
            <p className="text-slate-600 text-sm mb-6">Start a new conversation to begin</p>
            <button
              onClick={handleNewChat}
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
