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
    mutationFn: deleteConversation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      updateConversationTitle(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    remove: deleteMutation.mutate,
    rename: renameMutation.mutate,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  };
}
