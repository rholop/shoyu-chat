import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
  getMessages: vi.fn(),
  getRecentlyActiveConversations: vi.fn(),
}));

vi.mock('./aiRouter', () => ({
  summarize: vi.fn(),
}));

vi.mock('./markdownService', () => ({
  writeChatFile: vi.fn(),
  upsertWeeklyEntry: vi.fn(),
  writeMonthlyFile: vi.fn(),
  readWeeklySummary: vi.fn().mockReturnValue(''),
}));

vi.mock('../utils/dateHelpers', () => ({
  getISOWeekKey: vi.fn().mockReturnValue('2026-W18'),
  getMonthKey: vi.fn().mockReturnValue('2026-05'),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getConversationMeta, getMessages, getRecentlyActiveConversations } from '../storage';
import { summarize } from './aiRouter';
import { writeChatFile, upsertWeeklyEntry } from './markdownService';
import { runSummary, schedule, recoverSummaryTimers, flushAllPending } from './summaryService';

const CONV_ID = 'conv-abc';

const meta = { id: CONV_ID, title: 'My Chat', created_at: '2026-05-01T10:00:00Z' };
const messages = [
  { role: 'user' as const, content: 'Hello', created_at: '2026-05-01T10:00:00Z' },
  { role: 'assistant' as const, content: 'Hi there!', model: 'groq-chat', created_at: '2026-05-01T10:00:01Z' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConversationMeta).mockReturnValue(meta);
  vi.mocked(getMessages).mockReturnValue(messages);
  vi.mocked(summarize).mockResolvedValue('A summary sentence.');
});

afterEach(() => {
  vi.clearAllTimers();
});

describe('runSummary', () => {
  it('throws when conversation not found', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null);
    await expect(runSummary(CONV_ID)).rejects.toThrow(CONV_ID);
  });

  it('returns early when no messages', async () => {
    vi.mocked(getMessages).mockReturnValue([]);
    await runSummary(CONV_ID);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('calls summarize multiple times for full summary, topics, one-liner', async () => {
    await runSummary(CONV_ID);
    expect(summarize).toHaveBeenCalledTimes(3);
  });

  it('calls writeChatFile with conversation metadata', async () => {
    await runSummary(CONV_ID);
    expect(writeChatFile).toHaveBeenCalledWith(
      expect.objectContaining({ id: CONV_ID, title: 'My Chat' }),
    );
  });

  it('calls upsertWeeklyEntry with a one-liner', async () => {
    await runSummary(CONV_ID);
    expect(upsertWeeklyEntry).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Chat' }),
    );
  });
});

describe('schedule', () => {
  it('can be called without throwing', () => {
    vi.useFakeTimers();
    expect(() => schedule(CONV_ID)).not.toThrow();
    vi.useRealTimers();
  });
});

describe('recoverSummaryTimers', () => {
  it('calls schedule for each recently active conversation', () => {
    vi.mocked(getRecentlyActiveConversations).mockReturnValue(['conv-1', 'conv-2']);
    vi.useFakeTimers();
    recoverSummaryTimers();
    vi.useRealTimers();
    expect(getRecentlyActiveConversations).toHaveBeenCalled();
  });
});

describe('flushAllPending', () => {
  it('runs summaries for all pending conversations', async () => {
    vi.useFakeTimers();
    schedule('conv-x');
    vi.useRealTimers();
    await flushAllPending();
    expect(summarize).toHaveBeenCalled();
  });
});
