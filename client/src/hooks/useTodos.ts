import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as todosApi from '../api/todos';
import type { TodoUpdateFields } from '../types';

export function useTodos() {
  return useQuery({
    queryKey: ['todos'],
    queryFn: todosApi.listTodos,
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      todoId,
      updates
    }: {
      conversationId: string;
      todoId: string;
      updates: TodoUpdateFields & { snoozedUntil?: string | null };
    }) => todosApi.updateTodo(conversationId, todoId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    }
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, todoId }: { conversationId: string; todoId: string }) =>
      todosApi.deleteTodo(conversationId, todoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    }
  });
}
