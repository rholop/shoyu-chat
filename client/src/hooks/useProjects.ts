import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  updateProjectContext,
  assignConversation,
} from '../api/projects';

export function useProjects() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      createProject(name, description),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: { name?: string; description?: string } }) =>
      updateProject(id, fields),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    update: (id: string, fields: { name?: string; description?: string }) =>
      updateMutation.mutate({ id, fields }),
    remove: (id: string) => deleteMutation.mutate(id),
    refresh: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  };
}

export function useProject(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id),
    staleTime: 30 * 1000,
  });

  const updateContextMutation = useMutation({
    mutationFn: (content: string) => updateProjectContext(id, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ conversationId, projectId }: { conversationId: string; projectId: string | null }) =>
      assignConversation(conversationId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    updateContext: (content: string) => updateContextMutation.mutate(content),
    assign: (conversationId: string, projectId: string | null) =>
      assignMutation.mutate({ conversationId, projectId }),
    refresh: () => queryClient.invalidateQueries({ queryKey: ['project', id] }),
  };
}
