import type { Todo, TodoUpdateFields } from '../types';

const BASE = '/api/todos';

export async function listTodos(): Promise<Todo[]> {
  const res = await fetch(BASE, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch todos');
  const data = await res.json();
  return data.todos;
}

export async function listConversationTodos(conversationId: string): Promise<Todo[]> {
  const res = await fetch(`${BASE}/conversation/${conversationId}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch conversation todos');
  const data = await res.json();
  return data.todos;
}

export async function updateTodo(
  conversationId: string,
  todoId: string,
  updates: TodoUpdateFields & { snoozedUntil?: string | null }
): Promise<Todo> {
  const res = await fetch(`${BASE}/${conversationId}/${todoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update todo');
  const data = await res.json();
  return data.todo;
}

export async function deleteTodo(conversationId: string, todoId: string): Promise<void> {
  const res = await fetch(`${BASE}/${conversationId}/${todoId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to delete todo');
}

export function getTodosExportUrl(): string {
  return `${BASE}/export.ics`;
}

export function getSingleTodoExportUrl(conversationId: string, todoId: string): string {
  return `${BASE}/${conversationId}/${todoId}/export.ics`;
}

async function getDownloadToken(): Promise<{ token: string; expires: number }> {
  const res = await fetch(`${BASE}/download-token`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get download token');
  return res.json();
}

export async function exportAllTodosIcs(): Promise<void> {
  const { token, expires } = await getDownloadToken();
  window.location.href = `/api/download/${token}/${expires}/todos.ics`;
}

export async function exportSingleTodoIcs(conversationId: string, todoId: string): Promise<void> {
  const { token, expires } = await getDownloadToken();
  window.location.href = `/api/download/${token}/${expires}/todos/${conversationId}/${todoId}.ics`;
}

export async function getCalendarToken(): Promise<string> {
  const res = await fetch(`${BASE}/calendar-token`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to get calendar token');
  const data = await res.json();
  return data.token;
}
