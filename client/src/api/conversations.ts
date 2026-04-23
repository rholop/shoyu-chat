import { Conversation, ConversationWithMessages } from '../types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function listConversations(): Promise<Conversation[]> {
  return apiFetch('/api/conversations');
}

export async function getConversation(id: string): Promise<ConversationWithMessages> {
  return apiFetch(`/api/conversations/${id}`);
}

export async function createConversation(): Promise<{ id: string }> {
  return apiFetch('/api/conversations', { method: 'POST' });
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  await apiFetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
}
