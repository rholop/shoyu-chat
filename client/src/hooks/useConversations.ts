import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listConversations,
  createConversation,
  deleteConversation,
  updateConversationTitle,
} from '../api/conversations';

export function useConversations() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConversation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updateConversationTitle(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    remove: (id: string) => deleteMutation.mutate(id),
    rename: (id: string, title: string) => renameMutation.mutate({ id, title }),
    refresh: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  };
}
