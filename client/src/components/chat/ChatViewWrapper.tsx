import { useParams } from 'react-router-dom';
import ChatView from './ChatView';
import { useConversations } from '../../hooks/useConversations';
import { useChatStore } from '../../store/chatStore';
import { useEffect } from 'react';

export default function ChatViewWrapper() {
  const { id } = useParams();
  const { conversations, create, refresh } = useConversations();
  const { setActiveConversation } = useChatStore();

  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const activeConversation = conversations.find((c) => c.id === id);
  const title = activeConversation?.title ?? 'Shoyu Chat';

  const handleNewChat = async () => {
    const { id: newId } = await create();
    setActiveConversation(newId);
    refresh();
  };

  if (!id && conversations.length > 0) {
    // If we're at /chat and have conversations, we might want to redirect to the first one
    // But AppShell usually handles the default state.
  }

  if (id && !activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-[#586e75] dark:text-slate-400 text-lg mb-2">Conversation not found</p>
      </div>
    );
  }

  if (!id) {
     return (
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
        );
  }

  return (
    <ChatView
      conversationId={id}
      title={title}
      onMenuToggle={() => {}} // This should be handled by a global state or prop if needed
      onNewChat={handleNewChat}
    />
  );
}
