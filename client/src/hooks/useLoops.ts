import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as loopsApi from '../api/loops';

export function useLoops(filters?: { projectId?: string; intent?: string; age?: number }) {
  return useQuery({
    queryKey: ['loops', filters],
    queryFn: () => loopsApi.getLoops(filters),
  });
}

export function useSnoozeLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, snoozedUntil }: { conversationId: string; snoozedUntil: string }) =>
      loopsApi.snoozeLoop(conversationId, snoozedUntil),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loops'] })
  });
}

export function useResolveLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => loopsApi.resolveLoop(conversationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loops'] })
  });
}

export function useCreateTodoFromLoop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => loopsApi.createTodoFromLoop(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loops'] });
      qc.invalidateQueries({ queryKey: ['todos'] });
    }
  });
}
