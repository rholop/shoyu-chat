import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectContext,
  updateProjectContext,
  assignConversation,
} from './projects';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
  });
}

describe('projects API', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('listProjects', () => {
    it('fetches from GET /api/projects', async () => {
      vi.stubGlobal('fetch', mockFetch(200, []));
      await listProjects();
      expect(fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ credentials: 'include' }));
    });

    it('returns array of projects', async () => {
      const projects = [{ id: 'p1', name: 'Project', description: '', created_at: '', conversationCount: 0 }];
      vi.stubGlobal('fetch', mockFetch(200, projects));
      expect(await listProjects()).toEqual(projects);
    });

    it('throws on error', async () => {
      vi.stubGlobal('fetch', mockFetch(401, { error: 'Unauthorized' }));
      await expect(listProjects()).rejects.toThrow('Unauthorized');
    });
  });

  describe('getProject', () => {
    it('fetches from GET /api/projects/:id', async () => {
      const detail = { id: 'p1', name: 'P', description: '', created_at: '', contextDoc: '', summary: '', conversations: [] };
      vi.stubGlobal('fetch', mockFetch(200, detail));
      await getProject('p1');
      expect(fetch).toHaveBeenCalledWith('/api/projects/p1', expect.anything());
    });

    it('returns project detail', async () => {
      const detail = { id: 'p1', name: 'P', description: '', created_at: '', contextDoc: '# ctx', summary: 'sum', conversations: [] };
      vi.stubGlobal('fetch', mockFetch(200, detail));
      expect(await getProject('p1')).toEqual(detail);
    });

    it('throws 404', async () => {
      vi.stubGlobal('fetch', mockFetch(404, { error: 'Not found' }));
      await expect(getProject('missing')).rejects.toThrow('Not found');
    });
  });

  describe('createProject', () => {
    it('posts to /api/projects', async () => {
      vi.stubGlobal('fetch', mockFetch(201, { id: 'new' }));
      await createProject('My Project', 'A description');
      expect(fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'My Project', description: 'A description' }),
      }));
    });

    it('returns new project id', async () => {
      vi.stubGlobal('fetch', mockFetch(201, { id: 'new' }));
      expect(await createProject('P', '')).toEqual({ id: 'new' });
    });
  });

  describe('updateProject', () => {
    it('patches /api/projects/:id', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await updateProject('p1', { name: 'Updated' });
      expect(fetch).toHaveBeenCalledWith('/api/projects/p1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated' }),
      }));
    });

    it('throws on error', async () => {
      vi.stubGlobal('fetch', mockFetch(404, { error: 'Not found' }));
      await expect(updateProject('missing', { name: 'X' })).rejects.toThrow('Not found');
    });
  });

  describe('deleteProject', () => {
    it('sends DELETE to /api/projects/:id', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await deleteProject('p1');
      expect(fetch).toHaveBeenCalledWith('/api/projects/p1', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('getProjectContext', () => {
    it('fetches context from /api/projects/:id/context', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { content: '# ctx' }));
      expect(await getProjectContext('p1')).toEqual({ content: '# ctx' });
    });
  });

  describe('updateProjectContext', () => {
    it('puts context to /api/projects/:id/context', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await updateProjectContext('p1', '# new context');
      expect(fetch).toHaveBeenCalledWith('/api/projects/p1/context', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ content: '# new context' }),
      }));
    });
  });

  describe('assignConversation', () => {
    it('posts to /api/conversations/:id/assign', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await assignConversation('conv-1', 'proj-1');
      expect(fetch).toHaveBeenCalledWith('/api/conversations/conv-1/assign', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj-1' }),
      }));
    });

    it('passes null to unassign', async () => {
      vi.stubGlobal('fetch', mockFetch(200, { ok: true }));
      await assignConversation('conv-1', null);
      expect(fetch).toHaveBeenCalledWith('/api/conversations/conv-1/assign', expect.objectContaining({
        body: JSON.stringify({ projectId: null }),
      }));
    });
  });
});
