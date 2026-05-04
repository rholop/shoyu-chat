import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Clipboard, Download } from 'lucide-react';
import ModelBadge from './ModelBadge';
import AttachmentChip from './AttachmentChip';
import { Message, MessageDownload } from '../../types';
import { useFileDownload } from '../../hooks/useFileDownload';

interface Props {
  message: Message;
  conversationId?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadChip({ dl, conversationId }: { dl: MessageDownload; conversationId: string }) {
  const { download } = useFileDownload();
  return (
    <button
      onClick={() => download(conversationId, dl.fileId, dl.filename)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-left w-full"
    >
      <Download size={14} className="shrink-0 text-indigo-500 dark:text-indigo-400" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 truncate">{dl.filename}</p>
        {dl.description && (
          <p className="text-xs text-indigo-500 dark:text-indigo-400 truncate">{dl.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {dl.updated && (
          <span className="text-xs bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded">
            v{dl.version} updated
          </span>
        )}
        {!dl.updated && dl.version === 1 && (
          <span className="text-xs text-indigo-400 dark:text-indigo-500">v1</span>
        )}
        {dl.size !== undefined && (
          <span className="text-xs text-indigo-400 dark:text-indigo-500">{formatBytes(dl.size)}</span>
        )}
      </div>
    </button>
  );
}

export default function MessageBubble({ message, conversationId }: Props) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
              : 'bg-[#e0d8c4] dark:bg-slate-800 text-[#073642] dark:text-slate-100 rounded-bl-sm'
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
                  <pre {...props} className="overflow-x-auto rounded-lg bg-[#d1c9b5] dark:bg-slate-900 p-3 my-2 text-xs">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => (
                  <code {...props} className={`${className ?? ''} text-xs`}>
                    {children}
                  </code>
                ),
                a: ({ children, ...props }) => (
                  <a {...props} className="text-indigo-600 dark:text-indigo-400 underline" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
          <div className={`flex mt-2 ${isUser ? 'justify-start' : 'justify-end'}`}>
            <button
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy message'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors min-w-[44px] min-h-[44px] justify-center ${
                isUser
                  ? 'text-indigo-200 hover:text-white hover:bg-indigo-500'
                  : 'text-[#93a1a1] dark:text-slate-500 hover:text-[#073642] dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              {copied ? <Check size={14} /> : <Clipboard size={14} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Download chips for AI-created files */}
        {!isUser && message.downloads && message.downloads.length > 0 && conversationId && (
          <div className="mt-2 flex flex-col gap-1.5">
            {message.downloads.map((dl) => (
              <DownloadChip key={dl.fileId} dl={dl} conversationId={conversationId} />
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1.5 mt-1 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-[#93a1a1] dark:text-slate-500">{formatTime(message.created_at)}</span>
          {!isUser && <ModelBadge model={message.model_used} intent={message.intent} />}
        </div>
      </div>
    </div>
  );
}
