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

  it('returns the resend result', async () => {
    const result = await sendWeeklyDigestEmail(params);
    expect(result).toEqual({ id: 'email-123' });
  });
});
