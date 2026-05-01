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

import { flushAllPending } from '../services/summaryService';
import { summarize } from '../services/aiRouter';
import { sendWeeklyDigestEmail } from '../services/emailService';
import { sendWeeklyDigest, scheduleWeeklyDigest } from './weeklyDigest';

describe('sendWeeklyDigest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flushes pending summaries before sending', async () => {
    await sendWeeklyDigest();
    expect(flushAllPending).toHaveBeenCalled();
  });

  it('calls summarize to generate insights', async () => {
    await sendWeeklyDigest();
    expect(summarize).toHaveBeenCalledWith(expect.stringContaining('Weekly summary'));
  });

  it('sends the digest email with assembled content', async () => {
    await sendWeeklyDigest();
    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        weekLabel: 'Apr 27 – May 3',
        insights: 'AI insights here.',
      }),
    );
  });

  it('falls back to unavailability message when summarize throws', async () => {
    vi.mocked(summarize).mockRejectedValue(new Error('quota'));
    await sendWeeklyDigest();
    expect(sendWeeklyDigestEmail).toHaveBeenCalledWith(
      expect.objectContaining({ insights: expect.stringContaining('unavailable') }),
    );
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
