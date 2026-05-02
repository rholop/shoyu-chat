import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../api/auth', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

import { getMe, login as apiLogin } from '../api/auth';
import { useAuth } from './useAuth';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isLoading is true initially', () => {
    vi.mocked(getMe).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('user is set when getMe resolves', async () => {
    const user = { userId: 1, username: 'alice' };
    vi.mocked(getMe).mockResolvedValue(user);
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.user).toEqual(user));
  });

  it('user is null when getMe rejects', async () => {
    vi.mocked(getMe).mockRejectedValue(new Error('Unauthorized'));
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('login calls apiLogin with credentials', async () => {
    vi.mocked(getMe).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(apiLogin).mockResolvedValue({ userId: 2, username: 'bob' });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await result.current.login({ username: 'bob', password: 'pass' });
    expect(apiLogin).toHaveBeenCalledWith('bob', 'pass');
  });

  it('loginError is set when login fails', async () => {
    vi.mocked(getMe).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(apiLogin).mockRejectedValue(new Error('Bad credentials'));
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    try { await result.current.login({ username: 'x', password: 'y' }); } catch {}
    await waitFor(() => expect(result.current.loginError).toBe('Bad credentials'));
  });
});
