import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
  getMessages: vi.fn(),
  getRecentlyActiveConversations: vi.fn(),
  dataDir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('fs', () => ({
  default: {
    writeFileSync: vi.fn(),
  },
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

vi.mock('./ledgerService', () => ({
  append: vi.fn().mockResolvedValue(undefined),
}));

import { getConversationMeta, getMessages, getRecentlyActiveConversations } from '../storage';
import { summarize } from './aiRouter';
import { writeChatFile, upsertWeeklyEntry } from './markdownService';
import { append as appendLedgerEntry } from './ledgerService';
import {
  runSummary,
  schedule,
  recoverSummaryTimers,
  flushAllPending,
  parseResolution,
} from './summaryService';

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

describe('parseResolution', () => {
  it('returns resolved: true for RESOLVED: yes', () => {
    const { summary, resolved } = parseResolution('The summary\nRESOLVED: yes');
    expect(summary).toBe('The summary');
    expect(resolved).toBe(true);
  });

  it('returns resolved: false for RESOLVED: no', () => {
    const { summary, resolved } = parseResolution('The summary\nRESOLVED: no');
    expect(summary).toBe('The summary');
    expect(resolved).toBe(false);
  });

  it('defaults to resolved: true when line is missing', () => {
    const { summary, resolved } = parseResolution('The summary');
    expect(summary).toBe('The summary');
    expect(resolved).toBe(true);
  });

  it('strips the RESOLVED line from the returned summary text', () => {
    const { summary } = parseResolution('Line 1\nRESOLVED: yes\nLine 2');
    expect(summary).toBe('Line 1\nLine 2');
  });
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

  it('calls ledgerService.append after summarization completes', async () => {
    await runSummary(CONV_ID);
    expect(appendLedgerEntry).toHaveBeenCalledWith(CONV_ID);
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
