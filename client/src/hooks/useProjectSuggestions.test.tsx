import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectSuggestions, useCreateProjectFromSuggestion, useDismissSuggestion } from './useProjectSuggestions';
import * as suggestionsApi from '../api/suggestions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../api/suggestions');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useProjectSuggestions hooks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('useProjectSuggestions', () => {
    it('returns suggestions on success', async () => {
      const mockSuggestions = [{ topic: 'Auth' }];
      vi.mocked(suggestionsApi.getProjectSuggestions).mockResolvedValue(mockSuggestions as any);

      const { result } = renderHook(() => useProjectSuggestions(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockSuggestions);
    });
  });

  describe('useCreateProjectFromSuggestion', () => {
    it('calls mutationFn and invalidates queries', async () => {
      vi.mocked(suggestionsApi.createProjectFromSuggestion).mockResolvedValue({ projectId: 'p1' });

      const { result } = renderHook(() => useCreateProjectFromSuggestion(), { wrapper: createWrapper() });

      await result.current.mutateAsync('Auth');
      expect(suggestionsApi.createProjectFromSuggestion).toHaveBeenCalledWith('Auth');
    });
  });

  describe('useDismissSuggestion', () => {
    it('calls mutationFn', async () => {
      vi.mocked(suggestionsApi.dismissSuggestion).mockResolvedValue();

      const { result } = renderHook(() => useDismissSuggestion(), { wrapper: createWrapper() });

      await result.current.mutateAsync('Auth');
      expect(suggestionsApi.dismissSuggestion).toHaveBeenCalledWith('Auth');
    });
  });
});
