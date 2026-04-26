import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, logout, getMe } from './auth';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: vi.fn().mockResolvedValue(body),
  });
}

describe('auth API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('posts credentials and returns user on success', async () => {
      const user = { userId: 1, username: 'alice', email: 'alice@example.com' };
      vi.stubGlobal('fetch', mockFetch(200, user));

      const result = await login('alice', 'secret');
      expect(result).toEqual(user);
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'alice', password: 'secret' }),
      }));
    });

    it('includes credentials: include', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { userId: 1, username: 'alice' }));
      await login('alice', 'secret');
      expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        credentials: 'include',
      }));
    });

    it('throws with server error message on failure', async () => {
      vi.stubGlobal('fetch', mockFetch(401, { error: 'Invalid credentials' }));
      await expect(login('alice', 'wrong')).rejects.toThrow('Invalid credentials');
    });

    it('throws with statusText when error body has no message', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValue(new Error('not json')),
      });
      vi.stubGlobal('fetch', fetchMock);
      await expect(login('alice', 'pass')).rejects.toThrow('Internal Server Error');
    });
  });

  describe('logout', () => {
    it('posts to logout endpoint', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await logout();
      expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
    });

    it('resolves without error on success', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await expect(logout()).resolves.not.toThrow();
    });
  });

  describe('getMe', () => {
    beforeEach(() => {
      // getMe uses fetch directly, not apiFetch
    });

    it('returns user on 200', async () => {
      const user = { userId: 1, username: 'alice' };
      vi.stubGlobal('fetch', mockFetch(200, user));
      const result = await getMe();
      expect(result).toEqual(user);
    });

    it('returns null on 401', async () => {
      vi.stubGlobal('fetch', mockFetch(401, { error: 'Unauthorized' }));
      const result = await getMe();
      expect(result).toBeNull();
    });

    it('throws on non-401 error', async () => {
      vi.stubGlobal('fetch', mockFetch(500, { error: 'Server error' }));
      await expect(getMe()).rejects.toThrow('Server error');
    });

    it('fetches from /api/auth/me with credentials', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { userId: 1, username: 'alice' }));
      await getMe();
      expect(fetch).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
    });
  });
});
