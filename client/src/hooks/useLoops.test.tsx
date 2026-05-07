import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLoops, useSnoozeLoop, useResolveLoop, useCreateTodoFromLoop } from './useLoops';
import * as loopsApi from '../api/loops';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../api/loops');

describe('useLoops hooks', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.resetAllMocks();
    queryClient.clear();
  });

  it('useLoops returns loops on success', async () => {
    const mockData = { loops: [], total: 0 };
    vi.mocked(loopsApi.getLoops).mockResolvedValue(mockData);

    const { result } = renderHook(() => useLoops(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it('useSnoozeLoop invalidates loops on success', async () => {
    vi.mocked(loopsApi.snoozeLoop).mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSnoozeLoop(), { wrapper });
    await result.current.mutateAsync({ conversationId: '1', snoozedUntil: '2024-01-01' });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loops'] });
  });

  it('useResolveLoop invalidates loops on success', async () => {
    vi.mocked(loopsApi.resolveLoop).mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useResolveLoop(), { wrapper });
    await result.current.mutateAsync('1');

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loops'] });
  });

  it('useCreateTodoFromLoop invalidates both loops and todos on success', async () => {
    vi.mocked(loopsApi.createTodoFromLoop).mockResolvedValue({} as any);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateTodoFromLoop(), { wrapper });
    await result.current.mutateAsync('1');

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['loops'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['todos'] });
  });
});
