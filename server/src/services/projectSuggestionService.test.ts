import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as projectSuggestionService from './projectSuggestionService';
import * as ledgerService from './ledgerService';
import * as aiRouter from './aiRouter';
import fs from 'fs/promises';
import path from 'path';
import { dataDir } from '../storage';

vi.mock('./ledgerService');
vi.mock('./aiRouter');
vi.mock('fs/promises');
vi.mock('../storage', () => ({
  dataDir: () => '/mock/data',
}));

describe('projectSuggestionService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-20'));
  });

  describe('getProjectSuggestions', () => {
    it('returns empty array when ledger is empty', async () => {
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);
      const suggestions = await projectSuggestionService.getProjectSuggestions();
      expect(suggestions).toEqual([]);
    });

    it('returns suggestion when all thresholds are met', async () => {
      const mockEntries = [
        { date: '2024-05-01', conversationId: 'c1', topics: ['Auth'], projectId: null, goal: 'Goal 1' },
        { date: '2024-05-02', conversationId: 'c2', topics: ['Auth'], projectId: null, goal: 'Goal 2' },
        { date: '2024-05-03', conversationId: 'c3', topics: ['Auth'], projectId: null, goal: 'Goal 3' },
        { date: '2024-05-04', conversationId: 'c4', topics: ['Auth'], projectId: null, goal: 'Goal 4' },
        { date: '2024-05-15', conversationId: 'c5', topics: ['auth'], projectId: null, goal: 'Goal 5' },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries as any);
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const suggestions = await projectSuggestionService.getProjectSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].topic).toBe('Auth');
      expect(suggestions[0].conversationCount).toBe(5);
      expect(suggestions[0].weekCount).toBe(2); // May 1-4 is Week 18, May 15 is Week 20
      expect(suggestions[0].relatedGoals).toEqual(['Goal 5', 'Goal 4', 'Goal 3']);
    });

    it('excludes topic if any entry has a non-null projectId', async () => {
      const mockEntries = [
        { date: '2024-05-01', conversationId: 'c1', topics: ['Auth'], projectId: null },
        { date: '2024-05-02', conversationId: 'c2', topics: ['Auth'], projectId: null },
        { date: '2024-05-03', conversationId: 'c3', topics: ['Auth'], projectId: null },
        { date: '2024-05-04', conversationId: 'c4', topics: ['Auth'], projectId: null },
        { date: '2024-05-05', conversationId: 'c5', topics: ['Auth'], projectId: 'p1' },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries as any);
      const suggestions = await projectSuggestionService.getProjectSuggestions();
      expect(suggestions).toEqual([]);
    });

    it('returns empty array when topic most recent entry is older than 30 days', async () => {
      const mockEntries = [
        { date: '2024-04-01', conversationId: 'c1', topics: ['Old'], projectId: null },
        { date: '2024-04-02', conversationId: 'c2', topics: ['Old'], projectId: null },
        { date: '2024-04-03', conversationId: 'c3', topics: ['Old'], projectId: null },
        { date: '2024-04-04', conversationId: 'c4', topics: ['Old'], projectId: null },
        { date: '2024-04-05', conversationId: 'c5', topics: ['Old'], projectId: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries as any);
      const suggestions = await projectSuggestionService.getProjectSuggestions();
      expect(suggestions).toEqual([]);
    });

    it('returns max 3 suggestions sorted by conversationCount', async () => {
      const mockEntries = [];
      for (let i = 0; i < 10; i++) mockEntries.push({ date: '2024-05-01', conversationId: `c${i}`, topics: ['T1'], projectId: null, date_obj: new Date('2024-05-01') });
      for (let i = 10; i < 18; i++) mockEntries.push({ date: '2024-05-01', conversationId: `c${i}`, topics: ['T2'], projectId: null });
      for (let i = 18; i < 24; i++) mockEntries.push({ date: '2024-05-01', conversationId: `c${i}`, topics: ['T3'], projectId: null });
      for (let i = 24; i < 29; i++) mockEntries.push({ date: '2024-05-01', conversationId: `c${i}`, topics: ['T4'], projectId: null });

      // Ensure they span multiple weeks
      mockEntries[0].date = '2024-05-15';
      mockEntries[10].date = '2024-05-15';
      mockEntries[18].date = '2024-05-15';
      mockEntries[24].date = '2024-05-15';

      vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries as any);
      const suggestions = await projectSuggestionService.getProjectSuggestions();
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0].topic).toBe('T1');
      expect(suggestions[1].topic).toBe('T2');
      expect(suggestions[2].topic).toBe('T3');
    });

    it('excludes dismissed topics', async () => {
      const mockEntries = [
        { date: '2024-05-01', conversationId: 'c1', topics: ['Auth'], projectId: null },
        { date: '2024-05-02', conversationId: 'c2', topics: ['Auth'], projectId: null },
        { date: '2024-05-03', conversationId: 'c3', topics: ['Auth'], projectId: null },
        { date: '2024-05-04', conversationId: 'c4', topics: ['Auth'], projectId: null },
        { date: '2024-05-15', conversationId: 'c5', topics: ['Auth'], projectId: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries as any);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(['auth']));

      const suggestions = await projectSuggestionService.getProjectSuggestions();
      expect(suggestions).toEqual([]);
    });
  });

  describe('dismissSuggestion', () => {
    it('writes to dismissed-suggestions.json', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(['old']));
      await projectSuggestionService.dismissSuggestion('Auth');
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dismissed-suggestions.json'),
        expect.stringContaining('"old"'),
        'utf8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dismissed-suggestions.json'),
        expect.stringContaining('"auth"'),
        'utf8'
      );
    });
  });

  describe('generateProjectContext', () => {
    it('calls aiRouter.summarize with a prompt mentioning the topic', async () => {
      const suggestion = {
        topic: 'Auth',
        conversationCount: 5,
        weekCount: 2,
        firstSeen: '2024-05-01',
        lastSeen: '2024-05-15',
        relatedGoals: ['Goal 1', 'Goal 2'],
        relatedConversationIds: ['c1', 'c2'],
      };

      await projectSuggestionService.generateProjectContext(suggestion);
      expect(aiRouter.summarize).toHaveBeenCalledWith(expect.stringContaining('Auth'));
      expect(aiRouter.summarize).toHaveBeenCalledWith(expect.stringContaining('Goal 1'));
    });
  });
});
