import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from './searchService';
import { SearchIndexService, SearchRecord } from './searchIndexService';

vi.mock('./searchIndexService', () => ({
  SearchIndexService: {
    getAllRecords: vi.fn(),
  },
}));

describe('SearchService', () => {
  const mockRecords: SearchRecord[] = [
    {
      id: '1',
      type: 'conversation',
      title: 'Auth Middleware Refactor',
      content: 'We updated the auth middleware to use JWT.',
      snippet: 'We updated...',
      sourcePath: 'data/conv-1/conversation.ndjson',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokens: 'auth middleware refactor we updated the auth middleware to use jwt',
    },
    {
      id: '2',
      type: 'project',
      title: 'Holop Project',
      content: 'Project description about holop.',
      snippet: 'Project description...',
      projectId: 'proj-123',
      sourcePath: 'data/proj-123/meta.json',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokens: 'holop project project description about holop',
    }
  ];

  beforeEach(() => {
    vi.mocked(SearchIndexService.getAllRecords).mockResolvedValue(mockRecords);
  });

  it('should find results by keyword', async () => {
    const results = await SearchService.search('auth');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('should rank exact title matches higher', async () => {
    const recordsWithSimilar = [
        ...mockRecords,
        {
            id: '3',
            type: 'conversation' as const,
            title: 'Other',
            content: 'Mentioning auth here',
            snippet: 'Mentioning...',
            sourcePath: 'data/conv-3/conversation.ndjson',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tokens: 'other mentioning auth here',
        }
    ];
    vi.mocked(SearchIndexService.getAllRecords).mockResolvedValue(recordsWithSimilar);

    const results = await SearchService.search('auth middleware');
    expect(results[0].id).toBe('1'); // Title match
  });

  it('should support phrase search', async () => {
    const results = await SearchService.search('"auth middleware"');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');

    const noResults = await SearchService.search('"non existent phrase"');
    expect(noResults).toHaveLength(0);
  });

  it('should apply project boost', async () => {
    const results = await SearchService.search('project', { projectId: 'proj-123' });
    expect(results[0].id).toBe('2');
    expect(results[0].score).toBeGreaterThan(30); // Base match + project boost
  });

  it('should handle fuzzy matching', async () => {
    const results = await SearchService.search('autn'); // typo for auth
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });
});
