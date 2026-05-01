import { useEffect, useRef } from 'react';
import { Menu, Plus } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useChat } from '../../hooks/useChat';
import { useFileUpload } from '../../hooks/useFileUpload';
import { Attachment, Message } from '../../types';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';

interface Props {
  conversationId: string;
  title?: string;
  onMenuToggle?: () => void;
  onNewChat?: () => void;
}

export default function ChatView({ conversationId, title, onMenuToggle, onNewChat }: Props) {
  const { messages: storedMessages, send, isLoading } = useChat(conversationId);
  const { messages: storeMessages, streamingContent, isStreaming, streamError } = useChatStore();
  const { attachments, uploading, uploadError, upload, remove, clear } = useFileUpload(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const displayMessages = storeMessages.length > 0 ? storeMessages : storedMessages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, streamingContent]);

  const handleSend = (content: string, currentAttachments: Attachment[]) => {
    const optimistic: Message = {
      id: Date.now(),
      conversation_id: conversationId,
      role: 'user',
      content,
      model_used: null,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      created_at: new Date().toISOString(),
    };
    send(content, optimistic, currentAttachments);
    clear();
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {/* Mobile sticky mini-bar — stays visible as messages scroll */}
        {(onMenuToggle || onNewChat) && (
          <div className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-slate-950/90 backdrop-blur border-b border-slate-800/60">
            {onMenuToggle && (
              <button
                onClick={onMenuToggle}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                aria-label="Toggle sidebar"
              >
                <Menu size={16} />
              </button>
            )}
            <span className="flex-1 text-xs font-medium text-slate-400 truncate">{title}</span>
            {onNewChat && (
              <button
                onClick={onNewChat}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                aria-label="New chat"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        )}

        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {displayMessages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-slate-500 text-sm">Start a conversation</p>
            </div>
          )}

          {displayMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} conversationId={conversationId} />
          ))}

          {isStreaming && streamingContent && (
            <MessageBubble
              message={{
                id: -1,
                conversation_id: conversationId,
                role: 'assistant',
                content: streamingContent,
                model_used: null,
                created_at: new Date().toISOString(),
              }}
              conversationId={conversationId}
            />
          )}

          {isStreaming && !streamingContent && (
            <div className="flex gap-3 justify-start">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                AI
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-5">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {(streamError || uploadError) && (
            <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
              {streamError ?? uploadError}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <MessageInput
        onSend={handleSend}
        onFilesDrop={upload}
        onFilesSelect={upload}
        attachments={attachments}
        onRemoveAttachment={remove}
        uploading={uploading}
        disabled={isStreaming}
      />
    </div>
  );
}
