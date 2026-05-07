import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as todosApi from '../api/todos';
import type { Todo } from '../types';

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
      updates: Partial<Pick<Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>>;
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
