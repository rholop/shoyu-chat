import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/summaryService', () => ({
  flushAllPending: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/markdownService', () => ({
  readWeeklySummary: vi.fn().mockReturnValue('| 2026-05-01 | Chat | Did stuff |'),
  readMonthlySummary: vi.fn().mockReturnValue('You worked on things.'),
}));

vi.mock('../services/aiRouter', () => ({
  summarize: vi.fn().mockResolvedValue('AI insights here.'),
}));

vi.mock('../services/emailService', () => ({
  sendWeeklyDigestEmail: vi.fn().mockResolvedValue({ id: 'email-id' }),
}));

vi.mock('../services/insightsService', () => ({
  buildPatternReport: vi.fn().mockResolvedValue({
    generatedAt: '2026-05-06T12:00:00Z',
    allTime: {
      topTopics: [],
      topIntents: [],
      totalConversations: 10,
      totalMessages: 50,
      mostActiveProject: 'Project X',
      topicsWithoutProject: ['orphan'],
    },
    last4Weeks: {
      topTopics: [{ topic: 'A', count: 5 }],
      topIntents: [{ intent: 'CODING', count: 5, percentage: 50 }],
      newTopics: ['new'],
      returningTopics: ['returning'],
      weeklyConversationCounts: [{ week: '2026-W18', count: 5 }],
    },
    recurring: {
      topicsSeenMultipleWeeks: [],
      longestRunningTopic: null,
    },
  }),
  getUnresolvedThreads: vi.fn().mockResolvedValue([
    {
      conversationId: 'c1',
      title: 'Unresolved Thread',
      goal: 'Goal stuff',
      projectId: null,
      projectName: null,
      date: '2026-05-01',
      daysSinceCreated: 5,
    },
  ]),
  buildRollingHistory: vi.fn().mockResolvedValue([
    { week: '2026-W17', conversationCount: 3, topTopics: ['react'], intents: ['CODING'], hadUnresolved: false },
    { week: '2026-W18', conversationCount: 5, topTopics: ['typescript', 'node'], intents: ['CODING'], hadUnresolved: true },
  ]),
}));

vi.mock('../storage', () => ({
  dataDir: () => '/mock/data',
  listProjects: vi.fn().mockReturnValue([{ id: 'p1', name: 'Project 1' }]),
  getProjectSummary: vi.fn().mockReturnValue('Project summary content.'),
}));

vi.mock('../utils/dateHelpers', () => ({
  getISOWeekKey: vi.fn().mockReturnValue('2026-W18'),
  getMonthKey: vi.fn().mockReturnValue('2026-05'),
  getWeekRangeLabel: vi.fn().mockReturnValue('Apr 27 – May 3'),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

vi.mock('../services/projectSuggestionService', () => ({
  getProjectSuggestions: vi.fn().mockResolvedValue([
    { topic: 'Auth', conversationCount: 5, weekCount: 2, relatedGoals: ['Goal 1'] }
  ]),
}));

import { flushAllPending } from '../services/summaryService';
import { summarize } from '../services/aiRouter';
import { sendWeeklyDigestEmail } from '../services/emailService';
import { buildRollingHistory } from '../services/insightsService';
import { sendWeeklyDigest, scheduleWeeklyDigest } from './weeklyDigest';

describe('sendWeeklyDigest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flushes pending summaries before sending', async () => {
    await sendWeeklyDigest();
    expect(flushAllPending).toHaveBeenCalled();
  });

  it('calls buildRollingHistory with 8 weeks', async () => {
    await sendWeeklyDigest();
    expect(buildRollingHistory).toHaveBeenCalledWith(8);
  });

  it('makes exactly 2 AI calls', async () => {
    await sendWeeklyDigest();
    expect(summarize).toHaveBeenCalledTimes(2);
  });

  it('initiates both AI calls before either resolves', async () => {
    let firstCallDone = false;

    vi.mocked(summarize)
      .mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 20));
        firstCallDone = true;
        return 'digest narrative';
      })
      .mockImplementationOnce(async () => {
        // If this runs before first resolves, firstCallDone is still false
        expect(firstCallDone).toBe(false);
        return 'personal insights';
      });

    await sendWeeklyDigest();
  });

  it('digest prompt contains week summary and pattern report data', async () => {
    await sendWeeklyDigest();
    const digestCall = vi.mocked(summarize).mock.calls[0][0];
    expect(digestCall).toContain("This Week's Conversations");
    expect(digestCall).toContain('Pattern Report');
    expect(digestCall).toContain('Active Projects');
  });

  it('insight prompt includes pattern report data', async () => {
    await sendWeeklyDigest();
    const insightCall = vi.mocked(summarize).mock.calls[1][0];
    expect(insightCall).toContain('Pattern Data');
    expect(insightCall).toContain('orphan'); // topicsWithoutProject from mock
  });

  it('insight prompt includes unresolved thread list', async () => {
    await sendWeeklyDigest();
    const insightCall = vi.mocked(summarize).mock.calls[1][0];
    expect(insightCall).toContain('Unresolved Threads');
    expect(insightCall).toContain('Unresolved Thread'); // title from mock
  });

  it('insight prompt includes rolling history', async () => {
    await sendWeeklyDigest();
    const insightCall = vi.mocked(summarize).mock.calls[1][0];
    expect(insightCall).toContain('Rolling 8-Week Conversation History');
    expect(insightCall).toContain('2026-W17');
  });

  it('insight prompt includes total conversation count for data-sparsity note', async () => {
    await sendWeeklyDigest();
    const insightCall = vi.mocked(summarize).mock.calls[1][0];
    expect(insightCall).toContain('10 conversations'); // totalConversations from mock
  });

  it('sends the digest email with both narratives', async () => {
    vi.mocked(summarize)
      .mockResolvedValueOnce('narrative digest content')
      .mockResolvedValueOnce('personal insights content');

    await sendWeeklyDigest();
    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        weekLabel: 'Apr 27 – May 3',
        digestNarrative: 'narrative digest content',
        personalInsights: 'personal insights content',
      }),
    );
  });

  it('falls back to unavailability message when summarize throws', async () => {
    vi.mocked(summarize).mockRejectedValue(new Error('quota'));
    await sendWeeklyDigest();
    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ digestNarrative: expect.stringContaining('unavailable') }),
    );
  });

  it('completes successfully when pattern report has no topics (new install)', async () => {
    const { buildPatternReport } = await import('../services/insightsService');
    vi.mocked(buildPatternReport).mockResolvedValueOnce({
      generatedAt: new Date().toISOString(),
      allTime: { topTopics: [], topIntents: [], totalConversations: 0, totalMessages: 0, mostActiveProject: null, topicsWithoutProject: [] },
      last4Weeks: { topTopics: [], topIntents: [], newTopics: [], returningTopics: [], weeklyConversationCounts: [] },
      recurring: { topicsSeenMultipleWeeks: [], longestRunningTopic: null },
    });
    await expect(sendWeeklyDigest()).resolves.not.toThrow();
  });

  it('completes successfully when unresolved threads list is empty', async () => {
    const { getUnresolvedThreads } = await import('../services/insightsService');
    vi.mocked(getUnresolvedThreads).mockResolvedValueOnce([]);
    await expect(sendWeeklyDigest()).resolves.not.toThrow();
  });

  it('completes successfully when rolling history has fewer than 8 weeks of data', async () => {
    vi.mocked(buildRollingHistory).mockResolvedValueOnce([
      { week: '2026-W18', conversationCount: 2, topTopics: ['react'], intents: ['CODING'], hadUnresolved: false },
    ]);
    await expect(sendWeeklyDigest()).resolves.not.toThrow();
  });
});

describe('scheduleWeeklyDigest', () => {
  it('registers a cron job without throwing', async () => {
    const cron = await import('node-cron');
    scheduleWeeklyDigest();
    expect(cron.default.schedule).toHaveBeenCalledWith(
      '59 23 * * 0',
      expect.any(Function),
      expect.objectContaining({ timezone: expect.any(String) }),
    );
  });
});
