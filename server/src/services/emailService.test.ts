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

import { sendWeeklyDigestEmail } from './emailService';

const params = {
  weekLabel: 'Apr 27 – May 3',
  weekSummary: '| 2026-05-01 | Chat | Did stuff |',
  monthSummary: 'You worked on things.',
  insights: 'Here are insights.',
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
      date: '2026-05-01',
      daysSinceCreated: 5,
    },
  ],
  date: 'May 3, 2026',
};

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

  it('includes week summary in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Did stuff');
  });

  it('includes AI insights in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Here are insights.');
  });

  it('includes pattern report in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Top topics:');
    expect(html).toContain('A (5)');
  });

  it('includes unresolved threads in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Loose Threads (1 unresolved)');
    expect(html).toContain('Unresolved Thread');
  });

  it('shows fallback text when weekSummary is empty', async () => {
    await sendWeeklyDigestEmail({ ...params, weekSummary: '' });
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('No conversations this week.');
  });

  it('shows fallback text when monthSummary is empty', async () => {
    await sendWeeklyDigestEmail({ ...params, monthSummary: '' });
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('No monthly summary yet.');
  });

  it('includes pattern report in html body', async () => {
    await sendWeeklyDigestEmail(params);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain('Top topics:');
    expect(html).toContain('A (5)');
    expect(html).toContain('CODING 50%');
  });

  it('returns the resend result', async () => {
    const result = await sendWeeklyDigestEmail(params);
    expect(result).toEqual({ id: 'email-123' });
  });
});
