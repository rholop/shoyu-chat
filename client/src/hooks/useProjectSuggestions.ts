import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as suggestionsApi from '../api/suggestions';

export function useProjectSuggestions() {
  return useQuery({
    queryKey: ['project-suggestions'],
    queryFn: suggestionsApi.getProjectSuggestions,
    staleTime: 1000 * 60 * 5, // refresh every 5 minutes
  });
}

export function useCreateProjectFromSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topic: string) => suggestionsApi.createProjectFromSuggestion(topic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topic: string) => suggestionsApi.dismissSuggestion(topic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-suggestions'] });
    },
  });
}
