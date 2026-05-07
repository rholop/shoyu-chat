import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTodos, useUpdateTodo, useDeleteTodo } from './useTodos';
import * as todosApi from '../api/todos';
import React from 'react';

vi.mock('../api/todos');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useTodos hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it('useTodos() returns todos array on success', async () => {
    const mockTodos = [{ id: 't1', text: 'Task' }];
    vi.mocked(todosApi.listTodos).mockResolvedValue(mockTodos as any);

    const { result } = renderHook(() => useTodos(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTodos);
  });

  it('useUpdateTodo() invalidates ["todos"] query on success', async () => {
    vi.mocked(todosApi.updateTodo).mockResolvedValue({ id: 't1' } as any);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTodo(), { wrapper });
    await result.current.mutateAsync({ conversationId: 'c1', todoId: 't1', updates: { status: 'done' } });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });

  it('useDeleteTodo() invalidates ["todos"] query on success', async () => {
    vi.mocked(todosApi.deleteTodo).mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteTodo(), { wrapper });
    await result.current.mutateAsync({ conversationId: 'c1', todoId: 't1' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });
});
