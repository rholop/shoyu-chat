import type { OpenLoop, Todo } from '../types';

export async function getLoops(filters?: {
  projectId?: string;
  intent?: string;
  age?: number;
}): Promise<{ loops: OpenLoop[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.intent) params.set('intent', filters.intent);
  if (filters?.age !== undefined) params.set('age', String(filters.age));
  const url = `/api/loops${params.toString() ? '?' + params : ''}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch loops');
  return res.json();
}

export async function snoozeLoop(conversationId: string, snoozedUntil: string): Promise<void> {
  const res = await fetch(`/api/loops/${conversationId}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ snoozedUntil })
  });
  if (!res.ok) throw new Error('Failed to snooze loop');
}

export async function resolveLoop(conversationId: string): Promise<void> {
  const res = await fetch(`/api/loops/${conversationId}/resolve`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to resolve loop');
}

export async function createTodoFromLoop(conversationId: string): Promise<Todo> {
  const res = await fetch(`/api/loops/${conversationId}/todo`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to create todo from loop');
  const data = await res.json();
  return data.todo;
}
