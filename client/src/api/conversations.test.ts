import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversationTitle,
  deleteConversation,
} from './conversations';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
  });
}

describe('conversations API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listConversations', () => {
    it('fetches from GET /api/conversations', async () => {
      vi.stubGlobal('fetch', mockFetch(200, []));
      await listConversations();
      expect(fetch).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({ credentials: 'include' }));
    });

    it('returns array of conversations', async () => {
      const convos = [{ id: '1', title: 'Chat', created_at: '', updated_at: '', model_last_used: null }];
      vi.stubGlobal('fetch', mockFetch(200, convos));
      const result = await listConversations();
      expect(result).toEqual(convos);
    });

    it('throws on error response', async () => {
      vi.stubGlobal('fetch', mockFetch(500, { error: 'Server error' }));
      await expect(listConversations()).rejects.toThrow('Server error');
    });
  });

  describe('getConversation', () => {
    it('fetches from GET /api/conversations/:id', async () => {
      const convo = { id: 'abc', title: 'Test', created_at: '', updated_at: '', model_last_used: null, messages: [] };
      vi.stubGlobal('fetch', mockFetch(200, convo));
      await getConversation('abc');
      expect(fetch).toHaveBeenCalledWith('/api/conversations/abc', expect.anything());
    });

    it('returns conversation with messages', async () => {
      const convo = { id: 'abc', title: 'Test', created_at: '', updated_at: '', model_last_used: null, messages: [] };
      vi.stubGlobal('fetch', mockFetch(200, convo));
      const result = await getConversation('abc');
      expect(result).toEqual(convo);
    });

    it('throws 404 error', async () => {
      vi.stubGlobal('fetch', mockFetch(404, { error: 'Not found' }));
      await expect(getConversation('missing')).rejects.toThrow('Not found');
    });
  });

  describe('createConversation', () => {
    it('posts to /api/conversations', async () => {
      vi.stubGlobal('fetch', mockFetch(201, { id: 'new-id' }));
      await createConversation();
      expect(fetch).toHaveBeenCalledWith('/api/conversations', expect.objectContaining({ method: 'POST' }));
    });

    it('returns the new conversation id', async () => {
      vi.stubGlobal('fetch', mockFetch(201, { id: 'new-id' }));
      const result = await createConversation();
      expect(result).toEqual({ id: 'new-id' });
    });
  });

  describe('updateConversationTitle', () => {
    it('patches /api/conversations/:id with new title', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await updateConversationTitle('abc', 'New Title');
      expect(fetch).toHaveBeenCalledWith('/api/conversations/abc', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'New Title' }),
      }));
    });

    it('throws on error', async () => {
      vi.stubGlobal('fetch', mockFetch(404, { error: 'Not found' }));
      await expect(updateConversationTitle('missing', 'Title')).rejects.toThrow('Not found');
    });
  });

  describe('deleteConversation', () => {
    it('sends DELETE to /api/conversations/:id', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await deleteConversation('abc');
      expect(fetch).toHaveBeenCalledWith('/api/conversations/abc', expect.objectContaining({ method: 'DELETE' }));
    });

    it('throws on 404', async () => {
      vi.stubGlobal('fetch', mockFetch(404, { error: 'Not found' }));
      await expect(deleteConversation('missing')).rejects.toThrow('Not found');
    });
  });
});
