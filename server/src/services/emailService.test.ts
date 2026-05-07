import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ id: 'email-123' }),
}));

vi.mock('resend', () => ({
  Resend: vi.fn(function () { return { emails: { send: mockSend } }; }),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendWeeklyDigestEmail, buildDigestEmailHtml, DigestEmailParams } from './emailService';

const params: DigestEmailParams = {
  weekLabel: 'Apr 27 – May 3',
  weekSummary: '| 2026-05-01 | Chat | Did stuff |',
  monthSummary: 'You worked on things.',
  projectSummaries: 'Project Alpha summary content.',
  digestNarrative: 'Here are insights.',
  personalInsights: 'What You\'re Actually Focused On: TypeScript patterns.',
  patternReport: {
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
  },
  unresolvedThreads: [
    {
      conversationId: 'c1',
      title: 'Unresolved Thread',
      goal: 'Goal stuff',
      projectId: null,
      projectName: null,
      intent: 'CODING',
      topics: ['A'],
      createdAt: '2026-05-01T12:00:00Z',
      summarizedAt: '2026-05-01T12:00:00Z',
      daysSinceCreated: 5,
      snoozedUntil: null,
    },
  ],
  projectSuggestions: [],
  date: 'May 3, 2026',
};

describe('buildDigestEmailHtml', () => {
  it('contains About You This Week section', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('About You This Week');
  });

  it('renders personalInsights in About You This Week', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('TypeScript patterns');
  });

  it('contains Loose Threads section when unresolvedThreads is non-empty', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('Loose Threads');
    expect(html).toContain('Unresolved Thread');
  });

  it('omits Loose Threads section when unresolvedThreads is empty', () => {
    const html = buildDigestEmailHtml({ ...params, unresolvedThreads: [] });
    expect(html).not.toContain('Loose Threads');
  });

  it('contains Your Numbers raw data table', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('Your Numbers');
    expect(html).toContain('Top topics');
    expect(html).toContain('Intent split');
    expect(html).toContain('A (5)');
  });

  it('contains Week at a Glance section', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('Week at a Glance');
  });

  it('contains This Week\'s Summary with digestNarrative', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain("This Week");
    expect(html).toContain('Here are insights.');
  });

  it('contains Active Projects section when projectSummaries is non-empty', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('Active Projects');
    expect(html).toContain('Project Alpha summary content.');
  });

  it('omits Active Projects section when projectSummaries is empty', () => {
    const html = buildDigestEmailHtml({ ...params, projectSummaries: '' });
    expect(html).not.toContain('Active Projects');
  });

  it('contains Monthly Themes section', () => {
    const html = buildDigestEmailHtml(params);
    expect(html).toContain('Monthly Themes');
    expect(html).toContain('You worked on things.');
  });

  it('shows fallback text when digestNarrative is empty', () => {
    const html = buildDigestEmailHtml({ ...params, digestNarrative: '' });
    expect(html).toContain('No summary available.');
  });

  it('shows fallback text when monthSummary is empty', () => {
    const html = buildDigestEmailHtml({ ...params, monthSummary: '' });
    expect(html).toContain('No monthly summary yet.');
  });

  it('HTML-escapes user content to prevent injection', () => {
    const html = buildDigestEmailHtml({
      ...params,
      personalInsights: '<script>alert(1)</script>',
      unresolvedThreads: [
        { ...params.unresolvedThreads[0], title: '<b>Injected</b>' },
      ],
      projectSuggestions: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>Injected</b>');
    expect(html).toContain('&lt;b&gt;Injected&lt;/b&gt;');
  });
});

describe('sendWeeklyDigestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_TO = 'user@example.com';
    process.env.EMAIL_FROM = 'shoyu@holop.dev';
  });

  it('calls resend.emails.send with correct subject', async () => {
    await sendWeeklyDigestEmail(params);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Weekly AI Digest — Apr 27 – May 3' }),
    );
  });

  it('sends from EMAIL_FROM env var', async () => {
    await sendWeeklyDigestEmail(params);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'shoyu@holop.dev' }),
    );
  });

  it('sends to EMAIL_TO env var', async () => {
    await sendWeeklyDigestEmail(params);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    );
  });

  it('includes AI insights in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Here are insights.');
  });

  it('includes personal insights in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('About You This Week');
    expect(html).toContain('TypeScript patterns');
  });

  it('includes pattern report in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Top topics');
    expect(html).toContain('A (5)');
  });

  it('includes unresolved threads in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Loose Threads');
    expect(html).toContain('Unresolved Thread');
  });

  it('returns the resend result', async () => {
    const result = await sendWeeklyDigestEmail(params);
    expect(result).toEqual({ id: 'email-123' });
  });

  it('throws and logs an error when EMAIL_TO is not set', async () => {
    delete process.env.EMAIL_TO;
    const { logger } = await import('../utils/logger');
    await expect(sendWeeklyDigestEmail(params)).rejects.toThrow('EMAIL_TO is not configured');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('EMAIL_TO'));
  });

  it('HTML-escapes user content to prevent injection in the email body', async () => {
    const xssParams = {
      ...params,
      digestNarrative: '<script>alert(1)</script>',
      unresolvedThreads: [
        { ...params.unresolvedThreads[0], title: '<b>Injected</b>' },
      ],
      projectSuggestions: [],
    };
    await sendWeeklyDigestEmail(xssParams);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>Injected</b>');
    expect(html).toContain('&lt;b&gt;Injected&lt;/b&gt;');
  });
});
