import { useState, useCallback } from 'react';
import { Attachment } from '../types';
import { uploadFile, deleteFile } from '../api/files';

export function useFileUpload(conversationId: string | null) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      if (!conversationId) return;
      setUploading(true);
      setUploadError(null);

      const fileArray = Array.from(files);
      const results: Attachment[] = [];

      for (const file of fileArray) {
        try {
          const att = await uploadFile(conversationId, file);
          results.push(att);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
        }
      }

      setAttachments((prev) => [...prev, ...results]);
      setUploading(false);
    },
    [conversationId],
  );

  const remove = useCallback(
    async (fileId: string) => {
      if (!conversationId) return;
      setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));
      try {
        await deleteFile(conversationId, fileId);
      } catch {
        // File may already be gone; ignore errors on pre-send deletion
      }
    },
    [conversationId],
  );

  const clear = useCallback(() => {
    setAttachments([]);
    setUploadError(null);
  }, []);

  return { attachments, uploading, uploadError, upload, remove, clear };
}
