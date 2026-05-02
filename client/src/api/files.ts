import { Attachment } from '../types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function uploadFile(conversationId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('conversationId', conversationId);
  formData.append('file', file);

  const res = await fetch('/api/files/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Upload failed');
  }

  return res.json() as Promise<Attachment>;
}

export async function deleteFile(conversationId: string, fileId: string): Promise<void> {
  await apiFetch(`/api/files/${conversationId}/${fileId}`, { method: 'DELETE' });
}

export function getFileUrl(conversationId: string, fileId: string): string {
  return `/api/files/${conversationId}/${fileId}`;
}
