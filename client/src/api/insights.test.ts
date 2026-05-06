import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as insightsApi from './insights';

describe('insights api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls POST /api/insights/similar and returns matches', async () => {
    const mockMatches = [{ conversationId: 'c1' }];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ matches: mockMatches }),
    } as any);

    const result = await insightsApi.findSimilar('msg', 'curr');
    expect(fetch).toHaveBeenCalledWith('/api/insights/similar', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: 'msg', conversationId: 'curr' }),
    }));
    expect(result.matches).toEqual(mockMatches);
  });

  it('returns empty matches on failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
    } as any);

    const result = await insightsApi.findSimilar('msg', 'curr');
    expect(result.matches).toEqual([]);
  });
});
