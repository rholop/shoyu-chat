import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import suggestionsRouter from './suggestions';
import * as projectSuggestionService from '../services/projectSuggestionService';
import * as storage from '../storage';

vi.mock('../services/projectSuggestionService');
vi.mock('../storage', () => ({
  dataDir: () => '/mock/data',
  writeProjectContext: vi.fn(),
  createProject: vi.fn(),
  getProjectMeta: vi.fn(),
}));
vi.mock('../services/searchExtractor', () => ({
  SearchExtractor: {
    fromProject: vi.fn().mockReturnValue([]),
  },
}));
vi.mock('../services/searchIndexService', () => ({
  SearchIndexService: {
    indexRecord: vi.fn(),
  },
}));
vi.mock('../middleware/authMiddleware', () => ({
  requireAuth: (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/suggestions', suggestionsRouter);

describe('suggestions routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/suggestions/projects', () => {
    it('returns suggestions array', async () => {
      const mockSuggestions = [
        { topic: 'Auth', conversationCount: 5, weekCount: 2, firstSeen: '2024-01-01', lastSeen: '2024-01-15', relatedGoals: [], relatedConversationIds: [] },
      ];
      vi.mocked(projectSuggestionService.getProjectSuggestions).mockResolvedValue(mockSuggestions as any);

      const res = await request(app).get('/api/suggestions/projects');
      expect(res.status).toBe(200);
      expect(res.body.suggestions).toEqual(mockSuggestions);
    });
  });

  describe('POST /api/suggestions/projects/create', () => {
    it('returns projectId on success', async () => {
      const mockSuggestion = { topic: 'Auth', conversationCount: 5, weekCount: 2, firstSeen: '2024-01-01', lastSeen: '2024-01-15', relatedGoals: [], relatedConversationIds: [] };
      vi.mocked(projectSuggestionService.getProjectSuggestions).mockResolvedValue([mockSuggestion] as any);
      vi.mocked(projectSuggestionService.generateProjectContext).mockResolvedValue('Mock Context');
      vi.mocked(storage.createProject).mockReturnValue('new-p-id');

      const res = await request(app)
        .post('/api/suggestions/projects/create')
        .send({ topic: 'Auth' });

      expect(res.status).toBe(200);
      expect(res.body.projectId).toBe('new-p-id');
      expect(storage.writeProjectContext).toHaveBeenCalledWith('new-p-id', 'Mock Context');
      expect(projectSuggestionService.dismissSuggestion).toHaveBeenCalledWith('Auth');
    });

    it('returns 400 when topic is missing', async () => {
      const res = await request(app).post('/api/suggestions/projects/create').send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 when suggestion not found', async () => {
      vi.mocked(projectSuggestionService.getProjectSuggestions).mockResolvedValue([]);
      const res = await request(app).post('/api/suggestions/projects/create').send({ topic: 'Unknown' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/suggestions/projects/dismiss', () => {
    it('returns 200 on success', async () => {
      const res = await request(app).post('/api/suggestions/projects/dismiss').send({ topic: 'Auth' });
      expect(res.status).toBe(200);
      expect(projectSuggestionService.dismissSuggestion).toHaveBeenCalledWith('Auth');
    });

    it('returns 400 when topic missing', async () => {
      const res = await request(app).post('/api/suggestions/projects/dismiss').send({});
      expect(res.status).toBe(400);
    });
  });
});
