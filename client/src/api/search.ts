export interface SearchResult {
  id: string;
  type: 'conversation' | 'project' | 'summary' | 'upload' | 'download';
  title: string;
  snippet: string;
  conversationId?: string;
  conversationTitle?: string;
  projectId?: string;
  projectName?: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface SearchOptions {
  projectId?: string;
  types?: string[];
  includeInternal?: boolean;
  limit?: number;
}

export async function rebuildSearchIndex(): Promise<void> {
  const res = await fetch('/api/search/rebuild', { method: 'POST' });
  if (!res.ok) throw new Error('Rebuild failed');
}

export async function search(q: string, options: SearchOptions = {}): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (options.projectId) params.append('projectId', options.projectId);
  if (options.types) params.append('types', options.types.join(','));
  if (options.includeInternal) params.append('includeInternal', 'true');
  if (options.limit) params.append('limit', options.limit.toString());

  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Search failed');
  }
  return res.json();
}
