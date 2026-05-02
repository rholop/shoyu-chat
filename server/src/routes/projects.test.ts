import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../storage', () => ({
  listProjects: vi.fn(),
  listConversations: vi.fn(),
  getProjectMeta: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectContext: vi.fn(),
  writeProjectContext: vi.fn(),
  getProjectSummary: vi.fn(),
  listConversationsByProject: vi.fn(),
  assignConversationProject: vi.fn(),
}));

vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import {
  listProjects,
  listConversations,
  getProjectMeta,
  createProject,
  updateProject,
  deleteProject,
  getProjectContext,
  writeProjectContext,
  getProjectSummary,
  listConversationsByProject,
  assignConversationProject,
} from '../storage';
import projectsRouter from './projects';

const PROJECT = {
  id: 'proj-1',
  name: 'My Project',
  description: 'A test project',
  created_at: '2026-01-01T00:00:00Z',
};

describe('Projects routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);
  });

  describe('GET /', () => {
    it('returns projects with conversation counts', async () => {
      vi.mocked(listProjects).mockReturnValue([PROJECT]);
      vi.mocked(listConversations).mockReturnValue([
        { id: 'c1', title: 'Chat', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
        { id: 'c2', title: 'Chat 2', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
        { id: 'c3', title: 'Other', projectId: null, created_at: '', updated_at: '', model_last_used: null, has_files: false },
      ]);

      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].conversationCount).toBe(2);
    });

    it('returns empty array when no projects', async () => {
      vi.mocked(listProjects).mockReturnValue([]);
      vi.mocked(listConversations).mockReturnValue([]);
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /', () => {
    it('creates a project and returns id', async () => {
      vi.mocked(createProject).mockReturnValue('proj-new');
      const res = await request(app).post('/api/projects').send({ name: 'New Project', description: 'Desc' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: 'proj-new' });
      expect(createProject).toHaveBeenCalledWith('New Project', 'Desc');
    });

    it('creates project with empty description when omitted', async () => {
      vi.mocked(createProject).mockReturnValue('proj-new');
      const res = await request(app).post('/api/projects').send({ name: 'New Project' });
      expect(res.status).toBe(201);
      expect(createProject).toHaveBeenCalledWith('New Project', '');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/projects').send({ description: 'No name' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when name is empty', async () => {
      const res = await request(app).post('/api/projects').send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /:id', () => {
    it('returns 404 when project not found', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(null);
      const res = await request(app).get('/api/projects/missing');
      expect(res.status).toBe(404);
    });

    it('returns project detail with context, summary, and conversations', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(PROJECT);
      vi.mocked(getProjectContext).mockReturnValue('# Context');
      vi.mocked(getProjectSummary).mockReturnValue('You are building...');
      vi.mocked(listConversationsByProject).mockReturnValue([
        { id: 'c1', title: 'Chat', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
      ]);

      const res = await request(app).get('/api/projects/proj-1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('proj-1');
      expect(res.body.contextDoc).toBe('# Context');
      expect(res.body.summary).toBe('You are building...');
      expect(res.body.conversations).toHaveLength(1);
    });
  });

  describe('PATCH /:id', () => {
    it('updates project name', async () => {
      vi.mocked(updateProject).mockReturnValue(true);
      const res = await request(app).patch('/api/projects/proj-1').send({ name: 'Updated Name' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(updateProject).toHaveBeenCalledWith('proj-1', { name: 'Updated Name' });
    });

    it('returns 404 when project not found', async () => {
      vi.mocked(updateProject).mockReturnValue(false);
      const res = await request(app).patch('/api/projects/missing').send({ name: 'Name' });
      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid body', async () => {
      const res = await request(app).patch('/api/projects/proj-1').send({ name: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes project and unassigns conversations', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(PROJECT);
      vi.mocked(listConversationsByProject).mockReturnValue([
        { id: 'c1', title: 'Chat', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
      ]);
      vi.mocked(deleteProject).mockReturnValue(true);

      const res = await request(app).delete('/api/projects/proj-1');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(assignConversationProject).toHaveBeenCalledWith('c1', null);
      expect(deleteProject).toHaveBeenCalledWith('proj-1');
    });

    it('returns 404 when project not found', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(null);
      const res = await request(app).delete('/api/projects/missing');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /:id/context', () => {
    it('returns context content', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(PROJECT);
      vi.mocked(getProjectContext).mockReturnValue('# My context');
      const res = await request(app).get('/api/projects/proj-1/context');
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('# My context');
    });

    it('returns 404 when project not found', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(null);
      const res = await request(app).get('/api/projects/missing/context');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /:id/context', () => {
    it('writes context and returns ok', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(PROJECT);
      const res = await request(app).put('/api/projects/proj-1/context').send({ content: '# New context' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(writeProjectContext).toHaveBeenCalledWith('proj-1', '# New context');
    });

    it('returns 404 when project not found', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(null);
      const res = await request(app).put('/api/projects/missing/context').send({ content: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when content is missing', async () => {
      const res = await request(app).put('/api/projects/proj-1/context').send({});
      expect(res.status).toBe(400);
    });
  });
});
