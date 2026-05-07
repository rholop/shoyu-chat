import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as todosApi from './todos';

vi.stubGlobal('fetch', vi.fn());

describe('todos api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listTodos() calls correct URL with credentials', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ todos: [{ id: 't1' }] }),
    } as Response);

    const todos = await todosApi.listTodos();
    expect(todos).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith('/api/todos', expect.objectContaining({ credentials: 'include' }));
  });

  it('listTodos() throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(todosApi.listTodos()).rejects.toThrow('Failed to fetch todos');
  });

  it('updateTodo() sends PATCH with correct body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ todo: { id: 't1', status: 'done' } }),
    } as Response);

    const updated = await todosApi.updateTodo('c1', 't1', { status: 'done' });
    expect(updated.status).toBe('done');
    expect(fetch).toHaveBeenCalledWith('/api/todos/c1/t1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    }));
  });

  it('deleteTodo() sends DELETE to correct URL', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await todosApi.deleteTodo('c1', 't1');
    expect(fetch).toHaveBeenCalledWith('/api/todos/c1/t1', expect.objectContaining({
      method: 'DELETE',
    }));
  });
});
