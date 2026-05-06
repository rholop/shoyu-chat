import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as insightsService from './insightsService';
import * as ledgerService from './ledgerService';
import { LedgerEntry } from '../types';
import * as storage from '../storage';

vi.mock('./ledgerService');
vi.mock('../storage');

describe('insightsService', () => {
  const mockEntries: LedgerEntry[] = [
    {
      date: '2024-01-01',
      conversationId: 'c1',
      topics: ['typescript', 'react'],
      goal: 'test',
      intent: 'CODING',
      projectId: 'p1',
      projectName: 'Project 1',
      model: 'm1',
      messageCount: 10,
      resolved: null,
    },
    {
      date: '2024-01-08',
      conversationId: 'c2',
      topics: ['typescript', 'vitest'],
      goal: 'test',
      intent: 'CODING',
      projectId: 'p1',
      projectName: 'Project 1',
      model: 'm1',
      messageCount: 5,
      resolved: null,
    },
    {
      date: '2024-01-15',
      conversationId: 'c3',
      topics: ['typescript', 'node'],
      goal: 'test',
      intent: 'DEBUGGING',
      projectId: null,
      projectName: null,
      model: 'm1',
      messageCount: 2,
      resolved: null,
    },
    {
      date: '2024-01-22',
      conversationId: 'c4',
      topics: ['css'],
      goal: 'test',
      intent: 'DRAFTING',
      projectId: null,
      projectName: null,
      model: 'm1',
      messageCount: 1,
      resolved: null,
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-25'));
  });

  it('buildPatternReport correctly counts all-time topic frequencies', async () => {
    vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries);
    const report = await insightsService.buildPatternReport();

    const ts = report.allTime.topTopics.find(t => t.topic === 'typescript');
    expect(ts?.count).toBe(3);

    const react = report.allTime.topTopics.find(t => t.topic === 'react');
    expect(react?.count).toBe(1);
  });

  it('buildPatternReport correctly identifies topics without a project', async () => {
    vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries);
    const report = await insightsService.buildPatternReport();

    // 'typescript' is in p1, so it shouldn't be here
    expect(report.allTime.topicsWithoutProject).not.toContain('typescript');
    // 'css' is only in c4 which has no projectId
    expect(report.allTime.topicsWithoutProject).toContain('css');
  });

  it('buildPatternReport correctly identifies returning topics vs new topics', async () => {
    // Current date is 2024-01-25. 28 days ago is 2023-12-28.
    // All entries are recent in the mock above.
    // Let's add an old one.
    const entriesWithOld = [
      ...mockEntries,
      {
        date: '2023-11-01',
        conversationId: 'old1',
        topics: ['react', 'legacy'],
        goal: 'test',
        intent: 'CODING',
        projectId: null,
        projectName: null,
        model: 'm1',
        messageCount: 1,
        resolved: null,
      }
    ];
    vi.mocked(ledgerService.readAll).mockResolvedValue(entriesWithOld);

    const report = await insightsService.buildPatternReport();

    // 'react' was in 2023-11-01 and 2024-01-01 (recent)
    expect(report.last4Weeks.returningTopics).toContain('react');
    // 'vitest' is only in 2024-01-08
    expect(report.last4Weeks.newTopics).toContain('vitest');
    // 'legacy' is only in 2023-11-01
    expect(report.last4Weeks.newTopics).not.toContain('legacy');
    expect(report.last4Weeks.returningTopics).not.toContain('legacy');
  });

  it('buildPatternReport correctly identifies topics seen in 3+ weeks', async () => {
    vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries);
    const report = await insightsService.buildPatternReport();

    // 'typescript' is in 2024-01-01 (W1), 2024-01-08 (W2), 2024-01-15 (W3)
    const tsSeries = report.recurring.topicsSeenMultipleWeeks.find(s => s.topic === 'typescript');
    expect(tsSeries).toBeDefined();
    expect(tsSeries?.weekCount).toBe(3);
  });

  it('buildPatternReport returns empty/zero values gracefully when ledger is empty', async () => {
    vi.mocked(ledgerService.readAll).mockResolvedValue([]);
    const report = await insightsService.buildPatternReport();

    expect(report.allTime.totalConversations).toBe(0);
    expect(report.allTime.topTopics).toHaveLength(0);
    expect(report.last4Weeks.weeklyConversationCounts.length).toBeGreaterThan(0);
    expect(report.last4Weeks.weeklyConversationCounts.every(w => w.count === 0)).toBe(true);
  });

  it('Intent frequency percentages sum to 100', async () => {
    vi.mocked(ledgerService.readAll).mockResolvedValue(mockEntries);
    const report = await insightsService.buildPatternReport();

    const totalPercentage = report.allTime.topIntents.reduce((sum, i) => sum + i.percentage, 0);
    expect(totalPercentage).toBeCloseTo(100, 0);
  });

  describe('getUnresolvedThreads', () => {
    it('returns only conversations where resolved === false', async () => {
      const mockConversations: any[] = [
        { id: '1', title: 'Unresolved', resolved: false, created_at: '2024-01-20T10:00:00Z' },
        { id: '2', title: 'Resolved', resolved: true, created_at: '2024-01-21T10:00:00Z' },
        { id: '3', title: 'Null', resolved: null, created_at: '2024-01-22T10:00:00Z' },
      ];
      vi.mocked(storage.listConversations).mockReturnValue(mockConversations);
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);

      const result = await insightsService.getUnresolvedThreads();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Unresolved');
    });

    it('returns results sorted by created_at desc', async () => {
      const mockConversations: any[] = [
        { id: '1', title: 'Old', resolved: false, created_at: '2024-01-10T10:00:00Z' },
        { id: '2', title: 'New', resolved: false, created_at: '2024-01-20T10:00:00Z' },
      ];
      vi.mocked(storage.listConversations).mockReturnValue(mockConversations);
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);

      const result = await insightsService.getUnresolvedThreads();
      expect(result[0].title).toBe('New');
      expect(result[1].title).toBe('Old');
    });

    it('returns max 10 results', async () => {
      const mockConversations = Array.from({ length: 15 }, (_, i) => ({
        id: `${i}`,
        title: `Thread ${i}`,
        resolved: false,
        created_at: `2024-01-${10 + i}T10:00:00Z`,
      }));
      vi.mocked(storage.listConversations).mockReturnValue(mockConversations as any);
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);

      const result = await insightsService.getUnresolvedThreads();
      expect(result).toHaveLength(10);
    });

    it('correctly populates goal from ledger', async () => {
      const mockConversations: any[] = [
        { id: '1', title: 'Unresolved', resolved: false, created_at: '2024-01-20T10:00:00Z' },
      ];
      const mockLedger: LedgerEntry[] = [
        {
          conversationId: 'conversation-1',
          goal: 'Expected Goal',
          date: '2024-01-20',
          topics: [],
          intent: '',
          projectId: null,
          projectName: null,
          model: '',
          messageCount: 0,
          resolved: false,
        },
      ];
      vi.mocked(storage.listConversations).mockReturnValue(mockConversations);
      vi.mocked(ledgerService.readAll).mockResolvedValue(mockLedger);

      const result = await insightsService.getUnresolvedThreads();
      expect(result[0].goal).toBe('Expected Goal');
    });

    it('correctly calculates daysSinceCreated', async () => {
      vi.setSystemTime(new Date('2024-01-25T10:00:00Z'));
      const mockConversations: any[] = [
        { id: '1', title: '5 days ago', resolved: false, created_at: '2024-01-20T10:00:00Z' },
      ];
      vi.mocked(storage.listConversations).mockReturnValue(mockConversations);
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);

      const result = await insightsService.getUnresolvedThreads();
      expect(result[0].daysSinceCreated).toBe(5);
    });
  });

  it('topicsWithoutProject excludes topics that appear even once with a projectId', async () => {
     const entries: LedgerEntry[] = [
      {
        date: '2024-01-01',
        conversationId: 'c1',
        topics: ['shared'],
        goal: 'test',
        intent: 'CODING',
        projectId: 'p1',
        projectName: 'Project 1',
        model: 'm1',
        messageCount: 1,
        resolved: null,
      },
      {
        date: '2024-01-02',
        conversationId: 'c2',
        topics: ['shared', 'unique'],
        goal: 'test',
        intent: 'CODING',
        projectId: null,
        projectName: null,
        model: 'm1',
        messageCount: 1,
        resolved: null,
      },
    ];
    vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
    const report = await insightsService.buildPatternReport();

    expect(report.allTime.topicsWithoutProject).toContain('unique');
    expect(report.allTime.topicsWithoutProject).not.toContain('shared');
  });
});
