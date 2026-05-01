import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('initial user is null', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setUser stores a user object', () => {
    useAuthStore.getState().setUser({ userId: 1, username: 'alice' });
    expect(useAuthStore.getState().user).toEqual({ userId: 1, username: 'alice' });
  });

  it('setUser with null clears the user', () => {
    useAuthStore.setState({ user: { userId: 1, username: 'alice' } });
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setUser replaces an existing user', () => {
    useAuthStore.setState({ user: { userId: 1, username: 'alice' } });
    useAuthStore.getState().setUser({ userId: 2, username: 'bob' });
    expect(useAuthStore.getState().user?.username).toBe('bob');
  });
});
