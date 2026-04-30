import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import ModelBadge from './ModelBadge';
import AttachmentChip from './AttachmentChip';
import { Message } from '../../types';

interface Props {
  message: Message;
  conversationId?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, conversationId }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
          AI
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {/* Attachment chips above message bubble */}
        {message.attachments && message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 mb-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {message.attachments.map((att) => (
              <AttachmentChip
                key={att.fileId}
                attachment={att}
                conversationId={conversationId}
              />
            ))}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-indigo-600 text-white rounded-br-sm'
              : 'bg-slate-800 text-slate-100 rounded-bl-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children, ...props }) => (
                  <pre {...props} className="overflow-x-auto rounded-lg bg-slate-900 p-3 my-2 text-xs">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => (
                  <code {...props} className={`${className ?? ''} text-xs`}>
                    {children}
                  </code>
                ),
                a: ({ children, ...props }) => (
                  <a {...props} className="text-indigo-400 underline" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        <div className={`flex items-center gap-1.5 mt-1 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-slate-500">{formatTime(message.created_at)}</span>
          {!isUser && <ModelBadge model={message.model_used} />}
        </div>
      </div>
    </div>
  );
}
