import type { ProjectSuggestion } from '../types';

export async function getProjectSuggestions(): Promise<ProjectSuggestion[]> {
  const res = await fetch('/api/suggestions/projects', { credentials: 'include' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch suggestions' }));
    throw new Error(error.error || 'Failed to fetch suggestions');
  }
  const data = await res.json();
  return data.suggestions;
}

export async function createProjectFromSuggestion(topic: string): Promise<{ projectId: string }> {
  const res = await fetch('/api/suggestions/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to create project' }));
    throw new Error(error.error || 'Failed to create project');
  }
  return res.json();
}

export async function dismissSuggestion(topic: string): Promise<void> {
  const res = await fetch('/api/suggestions/projects/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to dismiss suggestion' }));
    throw new Error(error.error || 'Failed to dismiss suggestion');
  }
}
