import { Project, ProjectDetail } from '../types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function listProjects(): Promise<Project[]> {
  return apiFetch('/api/projects');
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return apiFetch(`/api/projects/${id}`);
}

export async function createProject(name: string, description: string): Promise<{ id: string }> {
  return apiFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function updateProject(
  id: string,
  fields: { name?: string; description?: string },
): Promise<void> {
  await apiFetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
}

export async function getProjectContext(id: string): Promise<{ content: string }> {
  return apiFetch(`/api/projects/${id}/context`);
}

export async function updateProjectContext(id: string, content: string): Promise<void> {
  await apiFetch(`/api/projects/${id}/context`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function assignConversation(
  conversationId: string,
  projectId: string | null,
): Promise<void> {
  await apiFetch(`/api/conversations/${conversationId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
}
