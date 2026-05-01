import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage', () => ({
  getProjectContext: vi.fn(),
  getProjectSummary: vi.fn(),
  writeProjectSummary: vi.fn(),
  getProjectMeta: vi.fn(),
  listConversations: vi.fn(),
  getMessages: vi.fn(),
}));

vi.mock('./aiRouter', () => ({
  summarize: vi.fn(),
}));

import {
  getProjectContext,
  getProjectSummary,
  writeProjectSummary,
  getProjectMeta,
  listConversations,
  getMessages,
} from '../storage';
import { summarize } from './aiRouter';
import { getContext, regenerateProjectSummary, readProjectSummary } from './projectService';

describe('projectService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getContext', () => {
    it('returns context from storage', () => {
      vi.mocked(getProjectContext).mockReturnValue('# My Project\n\nSome context.');
      expect(getContext('proj-1')).toBe('# My Project\n\nSome context.');
      expect(getProjectContext).toHaveBeenCalledWith('proj-1');
    });

    it('returns empty string when no context exists', () => {
      vi.mocked(getProjectContext).mockReturnValue('');
      expect(getContext('proj-1')).toBe('');
    });
  });

  describe('readProjectSummary', () => {
    it('returns summary from storage', () => {
      vi.mocked(getProjectSummary).mockReturnValue('You are building a chat app...');
      expect(readProjectSummary('proj-1')).toBe('You are building a chat app...');
    });
  });

  describe('regenerateProjectSummary', () => {
    it('does nothing when project not found', async () => {
      vi.mocked(getProjectMeta).mockReturnValue(null);
      await regenerateProjectSummary('missing');
      expect(summarize).not.toHaveBeenCalled();
      expect(writeProjectSummary).not.toHaveBeenCalled();
    });

    it('does nothing when no conversations in project', async () => {
      vi.mocked(getProjectMeta).mockReturnValue({
        id: 'proj-1',
        name: 'My Project',
        description: 'Test',
        created_at: '2026-01-01T00:00:00Z',
      });
      vi.mocked(listConversations).mockReturnValue([]);
      await regenerateProjectSummary('proj-1');
      expect(summarize).not.toHaveBeenCalled();
    });

    it('does nothing when conversations have no messages', async () => {
      vi.mocked(getProjectMeta).mockReturnValue({
        id: 'proj-1',
        name: 'My Project',
        description: 'Test',
        created_at: '2026-01-01T00:00:00Z',
      });
      vi.mocked(listConversations).mockReturnValue([
        { id: 'conv-1', title: 'Chat 1', projectId: 'proj-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', model_last_used: null, has_files: false },
      ]);
      vi.mocked(getMessages).mockReturnValue([]);
      await regenerateProjectSummary('proj-1');
      expect(writeProjectSummary).not.toHaveBeenCalled();
    });

    it('generates and writes project summary', async () => {
      vi.mocked(getProjectMeta).mockReturnValue({
        id: 'proj-1',
        name: 'My Project',
        description: 'Building a chat app',
        created_at: '2026-01-01T00:00:00Z',
      });
      vi.mocked(listConversations).mockReturnValue([
        { id: 'conv-1', title: 'Nginx config', projectId: 'proj-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', model_last_used: null, has_files: false },
      ]);
      vi.mocked(getMessages).mockReturnValue([
        { role: 'user', content: 'How do I configure Nginx?', created_at: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Here is how...', model: 'groq-chat', created_at: '2026-01-01T00:00:01Z' },
      ]);
      vi.mocked(summarize)
        .mockResolvedValueOnce('Configured Nginx reverse proxy.')
        .mockResolvedValueOnce('You are building a personal website with a reverse proxy.');

      await regenerateProjectSummary('proj-1');

      expect(summarize).toHaveBeenCalledTimes(2);
      expect(writeProjectSummary).toHaveBeenCalledWith('proj-1', 'You are building a personal website with a reverse proxy.');
    });

    it('skips conversations where summarization fails', async () => {
      vi.mocked(getProjectMeta).mockReturnValue({
        id: 'proj-1',
        name: 'My Project',
        description: 'Test',
        created_at: '2026-01-01T00:00:00Z',
      });
      vi.mocked(listConversations).mockReturnValue([
        { id: 'conv-1', title: 'Chat 1', projectId: 'proj-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', model_last_used: null, has_files: false },
        { id: 'conv-2', title: 'Chat 2', projectId: 'proj-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', model_last_used: null, has_files: false },
      ]);
      vi.mocked(getMessages)
        .mockReturnValueOnce([{ role: 'user', content: 'Hello', created_at: '' }])
        .mockReturnValueOnce([{ role: 'user', content: 'World', created_at: '' }]);
      vi.mocked(summarize)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce('Did something else.')
        .mockResolvedValueOnce('You are doing stuff.');

      await regenerateProjectSummary('proj-1');
      expect(writeProjectSummary).toHaveBeenCalledWith('proj-1', 'You are doing stuff.');
    });
  });
});
