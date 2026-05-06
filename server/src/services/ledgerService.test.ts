import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// We use a real temp directory so fs operations work naturally.
// DATA_DIR is set before importing the service.
let tmpDir: string;

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// We mock storage so we can control what meta/messages/project data the service sees.
vi.mock('../storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../storage')>();
  return {
    ...original,
    dataDir: vi.fn(() => tmpDir),
    getConversationMeta: vi.fn(),
    getMessages: vi.fn(),
    getProjectMeta: vi.fn(),
  };
});

import { dataDir, getConversationMeta, getMessages, getProjectMeta } from '../storage';
import * as ledger from './ledgerService';
import { logger } from '../utils/logger';

const CONV_ID = 'abc123';
const DATE = '2026-04-20';

const baseMeta = {
  id: CONV_ID,
  title: 'Test Chat',
  projectId: null as string | null | undefined,
  created_at: `${DATE}T10:00:00.000Z`,
};

const baseMessages = [
  { role: 'user' as const, content: 'Hello', created_at: `${DATE}T10:00:00Z` },
  { role: 'assistant' as const, content: 'Hi!', model: 'groq-chat', created_at: `${DATE}T10:00:01Z` },
];

function writeMd(dir: string, conversationId: string, date: string, summary: string, topics: string) {
  const chatsDir = path.join(dir, 'chats');
  fs.mkdirSync(chatsDir, { recursive: true });
  const content = `# Test Chat
**Date:** ${date}
**Model(s):** groq-chat

## Summary
${summary}

## Topics
${topics}

## Last Updated
${new Date().toISOString()}
`;
  fs.writeFileSync(path.join(chatsDir, `${date}-${conversationId}.md`), content, 'utf8');
}

function ledgerPath(dir: string) {
  return path.join(dir, 'insights', 'topic-ledger.jsonl');
}

function readLedger(dir: string) {
  const p = ledgerPath(dir);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-test-'));
  vi.mocked(dataDir).mockReturnValue(tmpDir);
  vi.mocked(getConversationMeta).mockReturnValue(baseMeta);
  vi.mocked(getMessages).mockReturnValue(baseMessages);
  vi.mocked(getProjectMeta).mockReturnValue(null);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ── append ────────────────────────────────────────────────────────────────────

describe('append()', () => {
  it('creates data/insights/ directory if missing', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth, JWT, Express');
    await ledger.append(CONV_ID);
    expect(fs.existsSync(path.join(tmpDir, 'insights'))).toBe(true);
  });

  it('writes a valid JSON line to the ledger', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth, JWT, Express');
    await ledger.append(CONV_ID);
    const entries = readLedger(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].conversationId).toBe(`conversation-${CONV_ID}`);
    expect(entries[0].date).toBe(DATE);
  });

  it('correctly parses topics from the markdown summary file', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth, JWT, Express, cookies');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.topics).toEqual(['auth', 'JWT', 'Express', 'cookies']);
  });

  it('correctly parses goal from the markdown summary file', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a JWT expiry bug. More context here.', 'auth, JWT');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.goal).toBe('Fixed a JWT expiry bug.');
  });

  it('handles missing Topics section gracefully — writes empty array, does not throw', async () => {
    const chatsDir = path.join(tmpDir, 'chats');
    fs.mkdirSync(chatsDir, { recursive: true });
    const content = `# Test Chat\n\n## Summary\nFixed a bug.\n\n## Last Updated\n${new Date().toISOString()}\n`;
    fs.writeFileSync(path.join(chatsDir, `${DATE}-${CONV_ID}.md`), content, 'utf8');

    await expect(ledger.append(CONV_ID)).resolves.not.toThrow();
    const [entry] = readLedger(tmpDir);
    expect(entry.topics).toEqual([]);
  });

  it('handles missing Summary section gracefully — writes empty string, does not throw', async () => {
    const chatsDir = path.join(tmpDir, 'chats');
    fs.mkdirSync(chatsDir, { recursive: true });
    const content = `# Test Chat\n\n## Topics\nauth, JWT\n\n## Last Updated\n${new Date().toISOString()}\n`;
    fs.writeFileSync(path.join(chatsDir, `${DATE}-${CONV_ID}.md`), content, 'utf8');

    await expect(ledger.append(CONV_ID)).resolves.not.toThrow();
    const [entry] = readLedger(tmpDir);
    expect(entry.goal).toBe('');
  });

  it('handles missing markdown file gracefully — logs warning, does not throw', async () => {
    await expect(ledger.append(CONV_ID)).resolves.not.toThrow();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining('markdown file not found'),
    );
    // Entry is still written with empty topics/goal
    const entries = readLedger(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].topics).toEqual([]);
    expect(entries[0].goal).toBe('');
  });

  it('is idempotent-safe — calling twice writes two lines', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth, JWT');
    await ledger.append(CONV_ID);
    await ledger.append(CONV_ID);
    const entries = readLedger(tmpDir);
    expect(entries).toHaveLength(2);
  });

  it('picks the most common model from messages', async () => {
    vi.mocked(getMessages).mockReturnValue([
      { role: 'user', content: 'a', created_at: '' },
      { role: 'assistant', content: 'b', model: 'groq-chat', created_at: '' },
      { role: 'assistant', content: 'c', model: 'groq-chat', created_at: '' },
      { role: 'assistant', content: 'd', model: 'gemini', created_at: '' },
    ]);
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.model).toBe('groq-chat');
  });

  it('resolves is always null in this iteration', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.resolved).toBeNull();
  });

  it('populates projectId and projectName when conversation has a project', async () => {
    const metaWithProject = { ...baseMeta, projectId: 'proj-id-1' };
    vi.mocked(getConversationMeta).mockReturnValue(metaWithProject);
    vi.mocked(getProjectMeta).mockReturnValue({
      id: 'proj-id-1',
      name: 'My Project',
      description: '',
      created_at: '',
    });
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.projectId).toBe('project-proj-id-1');
    expect(entry.projectName).toBe('My Project');
  });

  it('sets projectId and projectName to null when no project', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.projectId).toBeNull();
    expect(entry.projectName).toBeNull();
  });

  it('counts only non-internal messages for messageCount', async () => {
    vi.mocked(getMessages).mockReturnValue([
      { role: 'user', content: 'a', created_at: '' },
      { role: 'assistant', content: 'b', model: 'groq-chat', created_at: '' },
      { role: 'internal', content: '{"intent":"CODING"}', created_at: '' },
    ]);
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.messageCount).toBe(2);
  });

  it('picks most common intent from internal messages', async () => {
    vi.mocked(getMessages).mockReturnValue([
      { role: 'user', content: 'a', created_at: '' },
      { role: 'internal', content: '{"intent":"CODING"}', created_at: '' },
      { role: 'internal', content: '{"intent":"CODING"}', created_at: '' },
      { role: 'internal', content: '{"intent":"DEBUGGING"}', created_at: '' },
    ]);
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth');
    await ledger.append(CONV_ID);
    const [entry] = readLedger(tmpDir);
    expect(entry.intent).toBe('CODING');
  });

  it('logs warning and does not throw when conversation not found', async () => {
    vi.mocked(getConversationMeta).mockReturnValue(null);
    await expect(ledger.append(CONV_ID)).resolves.not.toThrow();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
  });
});

// ── readAll ───────────────────────────────────────────────────────────────────

describe('readAll()', () => {
  it('returns empty array when file does not exist', async () => {
    const entries = await ledger.readAll();
    expect(entries).toEqual([]);
  });

  it('skips malformed lines without throwing', async () => {
    fs.mkdirSync(path.join(tmpDir, 'insights'), { recursive: true });
    const p = ledgerPath(tmpDir);
    fs.writeFileSync(p, 'not-json\n{"date":"2026-04-20","conversationId":"conversation-abc123","topics":[],"goal":"","intent":"","projectId":null,"projectName":null,"model":"","messageCount":0,"resolved":null}\n', 'utf8');
    const entries = await ledger.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].conversationId).toBe('conversation-abc123');
  });

  it('correctly parses all valid lines', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth, JWT');
    await ledger.append(CONV_ID);
    await ledger.append(CONV_ID);
    const entries = await ledger.readAll();
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.date === DATE)).toBe(true);
  });
});

// ── readSince ─────────────────────────────────────────────────────────────────

describe('readSince()', () => {
  it('filters entries on or after the given date', async () => {
    writeMd(tmpDir, CONV_ID, DATE, 'Fixed a bug.', 'auth, JWT');
    fs.mkdirSync(path.join(tmpDir, 'insights'), { recursive: true });
    const entries = [
      { date: '2026-04-18', conversationId: 'conversation-old', topics: [], goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0, resolved: null },
      { date: '2026-04-20', conversationId: 'conversation-abc', topics: [], goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0, resolved: null },
      { date: '2026-04-22', conversationId: 'conversation-new', topics: [], goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0, resolved: null },
    ];
    fs.writeFileSync(ledgerPath(tmpDir), entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const result = await ledger.readSince('2026-04-20');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.date)).toEqual(['2026-04-20', '2026-04-22']);
  });
});

// ── getTopicFrequency ─────────────────────────────────────────────────────────

describe('getTopicFrequency()', () => {
  it('counts topics correctly and sorts descending', () => {
    const entries = [
      { date: '', conversationId: '', topics: ['React', 'TypeScript', 'React'], goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0, resolved: null },
      { date: '', conversationId: '', topics: ['React', 'CSS'], goal: '', intent: '', projectId: null, projectName: null, model: '', messageCount: 0, resolved: null },
    ];
    const freq = ledger.getTopicFrequency(entries);
    const pairs = [...freq.entries()];
    expect(pairs[0]).toEqual(['React', 3]);
    expect(pairs[1]).toEqual(['TypeScript', 1]);
    // CSS and TypeScript both have 1 — just check React is first
    expect(pairs[0][1]).toBeGreaterThan(pairs[1][1]);
  });

  it('returns empty map for empty entries', () => {
    expect(ledger.getTopicFrequency([])).toEqual(new Map());
  });
});

// ── getByProject ──────────────────────────────────────────────────────────────

describe('getByProject()', () => {
  it('filters entries by projectId', () => {
    const entries = [
      { date: '', conversationId: 'a', topics: [], goal: '', intent: '', projectId: 'project-p1', projectName: 'P1', model: '', messageCount: 0, resolved: null },
      { date: '', conversationId: 'b', topics: [], goal: '', intent: '', projectId: 'project-p2', projectName: 'P2', model: '', messageCount: 0, resolved: null },
      { date: '', conversationId: 'c', topics: [], goal: '', intent: '', projectId: 'project-p1', projectName: 'P1', model: '', messageCount: 0, resolved: null },
    ];
    const result = ledger.getByProject(entries, 'project-p1');
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.projectId === 'project-p1')).toBe(true);
  });

  it('returns empty array when no entries match', () => {
    expect(ledger.getByProject([], 'project-p1')).toEqual([]);
  });
});
