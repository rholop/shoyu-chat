import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as insightsService from './insightsService';
import * as ledgerService from './ledgerService';
import { LedgerEntry } from '../types';

vi.mock('./ledgerService');

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
