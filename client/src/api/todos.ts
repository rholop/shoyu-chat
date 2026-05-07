import type { Todo } from '../types';

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
  updates: Partial<Pick<Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>>
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
