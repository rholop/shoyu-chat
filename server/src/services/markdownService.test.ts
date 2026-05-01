import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-test-'));
  process.env.DATA_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

async function load() {
  const mod = await import('./markdownService?t=' + Date.now());
  return mod;
}

describe('writeChatFile', () => {
  it('creates a markdown file at data/chats/YYYY-MM-DD-{id}.md', async () => {
    const { writeChatFile } = await load();
    const filePath = writeChatFile({
      id: 'abc',
      title: 'My Chat',
      date: '2026-05-01',
      models: ['groq-chat'],
      summary: 'A summary.',
      topics: 'TypeScript, React',
    });
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('# My Chat');
    expect(content).toContain('A summary.');
    expect(content).toContain('TypeScript, React');
  });
});

describe('upsertWeeklyEntry / readWeeklySummary', () => {
  it('creates a new weekly file with header and first row', async () => {
    const { upsertWeeklyEntry, readWeeklySummary } = await load();
    upsertWeeklyEntry(
      { date: '2026-05-01', title: 'My Chat', oneLiner: 'Debugged a CORS issue.' },
      '2026-W18',
    );
    const content = readWeeklySummary('2026-W18');
    expect(content).toContain('Week 18');
    expect(content).toContain('Debugged a CORS issue.');
  });

  it('appends a second row to an existing file', async () => {
    const { upsertWeeklyEntry, readWeeklySummary } = await load();
    upsertWeeklyEntry(
      { date: '2026-05-01', title: 'Chat A', oneLiner: 'First.' },
      '2026-W18',
    );
    upsertWeeklyEntry(
      { date: '2026-05-02', title: 'Chat B', oneLiner: 'Second.' },
      '2026-W18',
    );
    const content = readWeeklySummary('2026-W18');
    expect(content).toContain('First.');
    expect(content).toContain('Second.');
  });

  it('readWeeklySummary returns empty string when file does not exist', async () => {
    const { readWeeklySummary } = await load();
    expect(readWeeklySummary('2020-W01')).toBe('');
  });
});

describe('writeMonthlyFile / readMonthlySummary', () => {
  it('creates a monthly file with overview and conversation list', async () => {
    const { writeMonthlyFile, readMonthlySummary } = await load();
    writeMonthlyFile({
      monthKey: '2026-05',
      overview: 'You spent time on TypeScript.',
      conversations: [
        { title: 'Chat A', oneLiner: 'Worked on types.' },
        { title: 'Chat B', oneLiner: 'Debugged tests.' },
      ],
    });
    const content = readMonthlySummary('2026-05');
    expect(content).toContain('You spent time on TypeScript.');
    expect(content).toContain('Chat A');
    expect(content).toContain('2 total');
  });

  it('readMonthlySummary returns empty string when file missing', async () => {
    const { readMonthlySummary } = await load();
    expect(readMonthlySummary('2000-01')).toBe('');
  });
});
