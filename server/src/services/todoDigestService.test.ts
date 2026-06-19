import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as todoDigestService from './todoDigestService';
import * as todoService from './todoService';
import { dataDir } from '../storage';
import fs from 'fs/promises';
import path from 'path';

vi.mock('./todoService');
vi.mock('../storage');
vi.mock('fs/promises');

describe('todoDigestService', () => {
  const MOCK_DATA_DIR = '/tmp/shoyu-digest-test';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dataDir).mockReturnValue(MOCK_DATA_DIR);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T12:00:00Z')); // A Sunday
  });

  describe('buildTodoDigestReport()', () => {
    it('returns zeros when no todos exist', async () => {
      vi.mocked(todoService.getAllTodosWithStatus).mockResolvedValue([]);

      const report = await todoDigestService.buildTodoDigestReport();

      expect(report.totalOpen).toBe(0);
      expect(report.totalDone).toBe(0);
      expect(report.createdThisWeek).toHaveLength(0);
      expect(report.completedThisWeek).toHaveLength(0);
      expect(report.overdue).toHaveLength(0);
    });

    it('categorizes todos correctly', async () => {
      const today = '2026-05-10';
      const yesterday = '2026-05-09';
      const eightDaysAgo = '2026-05-02';

      const todos: any[] = [
        {
          id: 't1',
          conversationId: 'conversation-c1',
          text: 'Created this week',
          status: 'open',
          priority: 'soon',
          createdAt: yesterday + 'T10:00:00Z',
          updatedAt: yesterday + 'T10:00:00Z'
        },
        {
          id: 't2',
          conversationId: 'conversation-c1',
          text: 'Completed this week',
          status: 'done',
          priority: 'soon',
          createdAt: eightDaysAgo + 'T10:00:00Z',
          updatedAt: yesterday + 'T15:00:00Z'
        },
        {
          id: 't3',
          conversationId: 'conversation-c1',
          text: 'Overdue by date',
          status: 'open',
          priority: 'soon',
          createdAt: eightDaysAgo + 'T10:00:00Z',
          updatedAt: eightDaysAgo + 'T10:00:00Z',
          dueDate: yesterday
        },
        {
          id: 't4',
          conversationId: 'conversation-c1',
          text: 'Overdue by priority now',
          status: 'open',
          priority: 'now',
          createdAt: eightDaysAgo + 'T10:00:00Z',
          updatedAt: eightDaysAgo + 'T10:00:00Z'
        },
        {
          id: 't5',
          conversationId: 'conversation-c1',
          text: 'Old but not overdue',
          status: 'open',
          priority: 'soon',
          createdAt: eightDaysAgo + 'T10:00:00Z',
          updatedAt: eightDaysAgo + 'T10:00:00Z'
        }
      ];

      vi.mocked(todoService.getAllTodosWithStatus).mockResolvedValue(todos);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ title: 'Test Title' }));

      const report = await todoDigestService.buildTodoDigestReport();

      expect(report.createdThisWeek).toHaveLength(1);
      expect(report.createdThisWeek[0].text).toBe('Created this week');

      expect(report.completedThisWeek).toHaveLength(1);
      expect(report.completedThisWeek[0].text).toBe('Completed this week');

      expect(report.overdue).toHaveLength(2);
      expect(report.overdue.map(t => t.text)).toContain('Overdue by date');
      expect(report.overdue.map(t => t.text)).toContain('Overdue by priority now');

      expect(report.totalOpen).toBe(4);
      expect(report.totalDone).toBe(1);
    });

    it('sorts report items correctly', async () => {
      const todos: any[] = [
        {
          id: 't1',
          conversationId: 'conversation-c1',
          text: 'Newer',
          status: 'open',
          priority: 'soon',
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z'
        },
        {
          id: 't2',
          conversationId: 'conversation-c1',
          text: 'Older',
          status: 'open',
          priority: 'soon',
          createdAt: '2026-05-08T10:00:00Z',
          updatedAt: '2026-05-08T10:00:00Z'
        },
        {
          id: 't3',
          conversationId: 'conversation-c1',
          text: 'Oldest Overdue',
          status: 'open',
          priority: 'now',
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z'
        },
        {
          id: 't4',
          conversationId: 'conversation-c1',
          text: 'Recent Overdue',
          status: 'open',
          priority: 'now',
          createdAt: '2026-05-02T10:00:00Z',
          updatedAt: '2026-05-02T10:00:00Z'
        }
      ];

      vi.mocked(todoService.getAllTodosWithStatus).mockResolvedValue(todos);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ title: 'Title' }));

      const report = await todoDigestService.buildTodoDigestReport();

      // Created this week: desc
      expect(report.createdThisWeek[0].text).toBe('Newer');
      expect(report.createdThisWeek[1].text).toBe('Older');

      // Overdue: oldest first (asc)
      expect(report.overdue[0].text).toBe('Oldest Overdue');
      expect(report.overdue[1].text).toBe('Recent Overdue');
    });

    it('resolves conversation titles and handles missing meta', async () => {
      const todos: any[] = [
        {
          id: 't1',
          conversationId: 'conversation-exists',
          text: 'T1',
          status: 'open',
          priority: 'soon',
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z'
        },
        {
          id: 't2',
          conversationId: 'conversation-missing',
          text: 'T2',
          status: 'open',
          priority: 'soon',
          createdAt: '2026-05-09T11:00:00Z',
          updatedAt: '2026-05-09T11:00:00Z'
        }
      ];

      vi.mocked(todoService.getAllTodosWithStatus).mockResolvedValue(todos);
      vi.mocked(fs.readFile).mockImplementation(async (p: any) => {
        if (p.includes('exists')) return JSON.stringify({ title: 'Known Title' });
        throw new Error('Not found');
      });

      const report = await todoDigestService.buildTodoDigestReport();

      expect(report.createdThisWeek.find(i => i.text === 'T1')?.conversationTitle).toBe('Known Title');
      expect(report.createdThisWeek.find(i => i.text === 'T2')?.conversationTitle).toBe('Untitled conversation');
    });

    it('flags untouched soon/someday todos older than their staleness threshold', async () => {
      const todos: any[] = [
        {
          id: 't1',
          conversationId: 'conversation-c1',
          text: 'Stale soon todo',
          status: 'open',
          priority: 'soon',
          createdAt: '2026-03-01T10:00:00Z', // > 30 days before 2026-05-10
          updatedAt: '2026-03-01T10:00:00Z',
          dueDate: null
        },
        {
          id: 't2',
          conversationId: 'conversation-c1',
          text: 'Stale someday todo',
          status: 'open',
          priority: 'someday',
          createdAt: '2026-02-01T10:00:00Z', // > 60 days before 2026-05-10
          updatedAt: '2026-02-01T10:00:00Z',
          dueDate: null
        },
        {
          id: 't3',
          conversationId: 'conversation-c1',
          text: 'Old but edited, not stale',
          status: 'open',
          priority: 'soon',
          createdAt: '2026-03-01T10:00:00Z',
          updatedAt: '2026-04-01T10:00:00Z',
          dueDate: null
        },
        {
          id: 't4',
          conversationId: 'conversation-c1',
          text: 'Old but has due date, not stale',
          status: 'open',
          priority: 'someday',
          createdAt: '2026-02-01T10:00:00Z',
          updatedAt: '2026-02-01T10:00:00Z',
          dueDate: '2026-12-01'
        },
        {
          id: 't5',
          conversationId: 'conversation-c1',
          text: 'Recent someday, not stale',
          status: 'open',
          priority: 'someday',
          createdAt: '2026-05-01T10:00:00Z',
          updatedAt: '2026-05-01T10:00:00Z',
          dueDate: null
        }
      ];

      vi.mocked(todoService.getAllTodosWithStatus).mockResolvedValue(todos);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ title: 'Test Title' }));

      const report = await todoDigestService.buildTodoDigestReport();

      expect(report.stale.map(t => t.text)).toEqual(
        expect.arrayContaining(['Stale soon todo', 'Stale someday todo'])
      );
      expect(report.stale).toHaveLength(2);
      expect(report.stale.map(t => t.text)).not.toContain('Old but edited, not stale');
      expect(report.stale.map(t => t.text)).not.toContain('Old but has due date, not stale');
      expect(report.stale.map(t => t.text)).not.toContain('Recent someday, not stale');
    });
  });
});
