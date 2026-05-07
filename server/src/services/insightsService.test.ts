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

  describe('tokenize', () => {
    it('removes stopwords', () => {
      const tokens = insightsService.tokenize('the quick brown fox');
      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
    });

    it('lowercases and strips punctuation', () => {
      const tokens = insightsService.tokenize('React! TypeScript?');
      expect(tokens).toContain('react');
      expect(tokens).toContain('typescript');
    });

    it('filters tokens shorter than 3 characters', () => {
      const tokens = insightsService.tokenize('to be or not to be');
      expect(tokens).toHaveLength(0);
    });
  });

  describe('findSimilar', () => {
    it('returns empty array when ledger is empty', async () => {
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);
      const results = await insightsService.findSimilar('test message here', 'curr');
      expect(results).toEqual([]);
    });

    it('returns empty array when no entries meet threshold', async () => {
      const entries: LedgerEntry[] = [
        {
          date: '2024-01-01',
          conversationId: 'c1',
          topics: ['something-else'],
          goal: '',
          intent: '',
          projectId: null,
          projectName: null,
          model: '',
          messageCount: 0,
          resolved: null,
        },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const results = await insightsService.findSimilar('typescript react node', 'curr');
      expect(results).toEqual([]);
    });

    it('excludes the current conversationId from results', async () => {
      const entries: LedgerEntry[] = [
        {
          date: '2024-01-01',
          conversationId: 'conversation-curr',
          topics: ['typescript', 'react'],
          goal: '',
          intent: '',
          projectId: null,
          projectName: null,
          model: '',
          messageCount: 0,
          resolved: null,
        },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const results = await insightsService.findSimilar('typescript react node', 'curr');
      expect(results).toEqual([]);
    });

    it('returns max 2 results', async () => {
      const entries: LedgerEntry[] = [
        { conversationId: 'c1', topics: ['typescript'], date: '2024-01-01' },
        { conversationId: 'c2', topics: ['typescript'], date: '2024-01-02' },
        { conversationId: 'c3', topics: ['typescript'], date: '2024-01-03' },
      ].map(e => ({ ...e, goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0, resolved: null }));
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const results = await insightsService.findSimilar('typescript coding help', 'curr');
      expect(results).toHaveLength(2);
    });

    it('prefers unresolved conversations at equal score', async () => {
      const entries: LedgerEntry[] = [
        { conversationId: 'c1', topics: ['typescript'], date: '2024-01-01', resolved: true },
        { conversationId: 'c2', topics: ['typescript'], date: '2024-01-01', resolved: false },
      ].map(e => ({ ...e, goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0 }));
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      vi.mocked(storage.getConversationMeta).mockImplementation((id) => ({ id, title: id, created_at: '', resolved: null, resolvedAt: null, summarizedAt: null }));

      const results = await insightsService.findSimilar('typescript coding help', 'curr');
      expect(results[0].conversationId).toBe('c2');
    });

    it('prefers higher score over recency', async () => {
      const entries: LedgerEntry[] = [
        { conversationId: 'c1', topics: ['typescript', 'react'], date: '2024-01-01', resolved: null },
        { conversationId: 'c2', topics: ['typescript'], date: '2024-01-20', resolved: null },
      ].map(e => ({ ...e, goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0 }));
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      vi.mocked(storage.getConversationMeta).mockImplementation((id) => ({ id, title: id, created_at: '', resolved: null, resolvedAt: null, summarizedAt: null }));

      const results = await insightsService.findSimilar('typescript react coding', 'curr');
      // score for c1: 2 matches / 2 topics = 1.0
      // score for c2: 1 match / 1 topic = 1.0
      
      // Let's make scores different.
      // query: typescript react coding (3 tokens)
      // c1 topics: typescript, react -> entryTokens: typescript, react (2 tokens) -> score = 2 / 2 = 1.0
      // c2 topics: typescript, node, jest -> entryTokens: typescript, node, jest (3 tokens) -> score = 1 / 3 = 0.33
      entries[1].topics = ['typescript', 'node', 'jest'];
      
      const res2 = await insightsService.findSimilar('typescript react coding', 'curr');
      expect(res2[0].conversationId).toBe('c1');
    });

    it('prefers more recent at equal score', async () => {
      const entries: LedgerEntry[] = [
        { conversationId: 'c1', topics: ['typescript'], date: '2024-01-01', resolved: null },
        { conversationId: 'c2', topics: ['typescript'], date: '2024-01-20', resolved: null },
      ].map(e => ({ ...e, goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0 }));
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      vi.mocked(storage.getConversationMeta).mockImplementation((id) => ({ id, title: id, created_at: '', resolved: null, resolvedAt: null, summarizedAt: null }));

      const results = await insightsService.findSimilar('typescript coding help', 'curr');
      expect(results[0].conversationId).toBe('c2');
    });
  });

  describe('buildRollingHistory', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // 2024-03-14 is a Thursday in 2024-W11
      vi.setSystemTime(new Date('2024-03-14T12:00:00Z'));
    });

    it('returns empty array when ledger is empty', async () => {
      vi.mocked(ledgerService.readAll).mockResolvedValue([]);
      const result = await insightsService.buildRollingHistory(8);
      expect(result).toEqual([]);
    });

    it('returns at most 8 weeks when ledger spans more than 8 weeks', async () => {
      // Create 10 weeks of entries: from 2024-01-08 (W02) to 2024-03-11 (W11)
      const entries: LedgerEntry[] = [
        { date: '2024-01-08', conversationId: 'c1', topics: ['a'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-01-15', conversationId: 'c2', topics: ['b'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-01-22', conversationId: 'c3', topics: ['c'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-01-29', conversationId: 'c4', topics: ['d'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-02-05', conversationId: 'c5', topics: ['e'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-02-12', conversationId: 'c6', topics: ['f'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-02-19', conversationId: 'c7', topics: ['g'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-02-26', conversationId: 'c8', topics: ['h'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-03-04', conversationId: 'c9', topics: ['i'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-03-11', conversationId: 'c10', topics: ['j'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const result = await insightsService.buildRollingHistory(8);
      expect(result.length).toBeLessThanOrEqual(8);
    });

    it('returns fewer weeks when ledger is newer than requested range', async () => {
      // Only 2 weeks of data (W10 and W11), requesting 8
      const entries: LedgerEntry[] = [
        { date: '2024-03-04', conversationId: 'c1', topics: ['react'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 2, resolved: null },
        { date: '2024-03-11', conversationId: 'c2', topics: ['node'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const result = await insightsService.buildRollingHistory(8);
      expect(result.length).toBeLessThan(8);
      expect(result.length).toBeGreaterThan(0);
    });

    it('correctly counts conversations per week', async () => {
      // 2024-03-04 and 2024-03-05 are both in W10; 2024-03-11 is W11
      const entries: LedgerEntry[] = [
        { date: '2024-03-04', conversationId: 'c1', topics: ['react'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-03-05', conversationId: 'c2', topics: ['vue'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-03-11', conversationId: 'c3', topics: ['node'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const result = await insightsService.buildRollingHistory(8);

      const w10 = result.find(w => w.week === '2024-W10');
      const w11 = result.find(w => w.week === '2024-W11');
      expect(w10?.conversationCount).toBe(2);
      expect(w11?.conversationCount).toBe(1);
    });

    it('correctly identifies top 3 topics per week', async () => {
      const entries: LedgerEntry[] = [
        { date: '2024-03-04', conversationId: 'c1', topics: ['react', 'typescript', 'css', 'html'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-03-05', conversationId: 'c2', topics: ['react', 'typescript'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const result = await insightsService.buildRollingHistory(8);

      const w10 = result.find(w => w.week === '2024-W10');
      expect(w10?.topTopics).toHaveLength(3);
      // react and typescript appear twice, should be in top 3
      expect(w10?.topTopics).toContain('react');
      expect(w10?.topTopics).toContain('typescript');
    });

    it('sets hadUnresolved: true when any entry in that week has resolved === false', async () => {
      const entries: LedgerEntry[] = [
        { date: '2024-03-04', conversationId: 'c1', topics: ['react'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: false },
        { date: '2024-03-11', conversationId: 'c2', topics: ['node'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const result = await insightsService.buildRollingHistory(8);

      const w10 = result.find(w => w.week === '2024-W10');
      const w11 = result.find(w => w.week === '2024-W11');
      expect(w10?.hadUnresolved).toBe(true);
      expect(w11?.hadUnresolved).toBe(false);
    });

    it('returns results in oldest-to-newest order', async () => {
      const entries: LedgerEntry[] = [
        { date: '2024-03-04', conversationId: 'c1', topics: ['a'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
        { date: '2024-03-11', conversationId: 'c2', topics: ['b'], goal: '', intent: 'CODING', projectId: null, projectName: null, model: '', messageCount: 1, resolved: null },
      ];
      vi.mocked(ledgerService.readAll).mockResolvedValue(entries);
      const result = await insightsService.buildRollingHistory(8);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].week >= result[i - 1].week).toBe(true);
      }
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
