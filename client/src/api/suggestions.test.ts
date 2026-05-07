import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as suggestionsApi from './suggestions';

vi.stubGlobal('fetch', vi.fn());

describe('suggestions API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getProjectSuggestions', () => {
    it('calls correct URL', async () => {
      const mockSuggestions = [{ topic: 'Auth' }];
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: mockSuggestions }),
      } as Response);

      const result = await suggestionsApi.getProjectSuggestions();
      expect(fetch).toHaveBeenCalledWith('/api/suggestions/projects', expect.objectContaining({ credentials: 'include' }));
      expect(result).toEqual(mockSuggestions);
    });
  });

  describe('createProjectFromSuggestion', () => {
    it('sends correct body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ projectId: 'p1' }),
      } as Response);

      const result = await suggestionsApi.createProjectFromSuggestion('Auth');
      expect(fetch).toHaveBeenCalledWith('/api/suggestions/projects/create', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ topic: 'Auth' }),
      }));
      expect(result).toEqual({ projectId: 'p1' });
    });
  });

  describe('dismissSuggestion', () => {
    it('sends correct body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
      } as Response);

      await suggestionsApi.dismissSuggestion('Auth');
      expect(fetch).toHaveBeenCalledWith('/api/suggestions/projects/dismiss', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ topic: 'Auth' }),
      }));
    });
  });
});
