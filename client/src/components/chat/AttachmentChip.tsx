import { X, FileText, Image, FileCode, FileJson } from 'lucide-react';
import { Attachment } from '../../types';
import { getFileUrl } from '../../api/files';

interface Props {
  attachment: Attachment;
  conversationId?: string;
  onRemove?: () => void;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image size={14} />;
  if (mimeType === 'application/json') return <FileJson size={14} />;
  if (mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('html') || mimeType.includes('css'))
    return <FileCode size={14} />;
  return <FileText size={14} />;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function AttachmentChip({ attachment, conversationId, onRemove }: Props) {
  const isImage = attachment.mimeType.startsWith('image/');
  const fileUrl = conversationId ? getFileUrl(conversationId, attachment.fileId) : undefined;

  const content = (
    <div className="flex items-center gap-1.5 max-w-[180px]">
      {isImage && fileUrl ? (
        <img
          src={fileUrl}
          alt={attachment.filename}
          className="w-5 h-5 rounded object-cover shrink-0"
        />
      ) : (
        <span className="shrink-0 text-slate-400">
          <FileIcon mimeType={attachment.mimeType} />
        </span>
      )}
      <span className="text-xs text-slate-300 truncate">{attachment.filename}</span>
      {attachment.size && (
        <span className="text-xs text-slate-500 shrink-0">{formatSize(attachment.size)}</span>
      )}
    </div>
  );

  return (
    <div className="inline-flex items-center gap-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1">
      {fileUrl ? (
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
          {content}
        </a>
      ) : (
        content
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 p-0.5 rounded hover:bg-slate-600 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label={`Remove ${attachment.filename}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
