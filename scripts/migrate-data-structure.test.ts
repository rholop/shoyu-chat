import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigration, verifyMigration } from './migrate-data-structure';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoyu-migrate-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function setupOldStructure(opts: {
  conversations?: Array<{ id: string; meta?: object; messages?: string; files?: string[] }>;
  projects?: Array<{ id: string; meta?: object; context?: string; summary?: string }>;
  chatFiles?: string[];
}) {
  const convsDir = path.join(tmpDir, 'conversations');
  const projsDir = path.join(tmpDir, 'projects');
  const chatsDir = path.join(tmpDir, 'chats');

  if (opts.conversations?.length) {
    fs.mkdirSync(convsDir, { recursive: true });
    for (const c of opts.conversations) {
      const meta = c.meta ?? { id: c.id, title: 'Test', created_at: '2026-01-01T00:00:00Z' };
      fs.writeFileSync(path.join(convsDir, `${c.id}.json`), JSON.stringify(meta));
      fs.writeFileSync(path.join(convsDir, `${c.id}.ndjson`), c.messages ?? '');
      if (c.files?.length) {
        const fd = path.join(convsDir, c.id);
        fs.mkdirSync(fd, { recursive: true });
        for (const f of c.files) {
          fs.writeFileSync(path.join(fd, f), `content of ${f}`);
        }
      }
    }
  }

  if (opts.projects?.length) {
    fs.mkdirSync(projsDir, { recursive: true });
    for (const p of opts.projects) {
      const meta = p.meta ?? { id: p.id, name: 'Test Project', created_at: '2026-01-01T00:00:00Z' };
      fs.writeFileSync(path.join(projsDir, `${p.id}.json`), JSON.stringify(meta));
      if (p.context !== undefined) {
        fs.writeFileSync(path.join(projsDir, `${p.id}-context.md`), p.context);
      }
      if (p.summary !== undefined) {
        fs.writeFileSync(path.join(projsDir, `${p.id}-summary.md`), p.summary);
      }
    }
  }

  if (opts.chatFiles?.length) {
    fs.mkdirSync(chatsDir, { recursive: true });
    for (const f of opts.chatFiles) {
      fs.writeFileSync(path.join(chatsDir, f), `# Chat ${f}`);
    }
  }
}

describe('runMigration', () => {
  it('migrates a conversation to new directory structure', async () => {
    setupOldStructure({
      conversations: [{ id: 'conv-1', messages: '{"role":"user","content":"hi"}' }],
    });

    const report = await runMigration({ dataDir: tmpDir });
    expect(report.conversationsMigrated).toBe(1);
    expect(report.errors).toHaveLength(0);

    const newDir = path.join(tmpDir, 'conversation-conv-1');
    expect(fs.existsSync(newDir)).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'conversation.ndjson'))).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'uploads'))).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'downloads'))).toBe(true);
  });

  it('preserves conversation message content', async () => {
    const messages = '{"role":"user","content":"hello"}\n{"role":"assistant","content":"world"}';
    setupOldStructure({
      conversations: [{ id: 'conv-2', messages }],
    });

    await runMigration({ dataDir: tmpDir });
    const content = fs.readFileSync(path.join(tmpDir, 'conversation-conv-2', 'conversation.ndjson'), 'utf8');
    expect(content).toBe(messages);
  });

  it('moves attached files to uploads/', async () => {
    setupOldStructure({
      conversations: [{
        id: 'conv-3',
        files: ['uuid1-file.txt', 'uuid2-image.png'],
      }],
    });

    const report = await runMigration({ dataDir: tmpDir });
    expect(report.filesMoved).toBe(2);

    const uploadsDir = path.join(tmpDir, 'conversation-conv-3', 'uploads');
    expect(fs.existsSync(path.join(uploadsDir, 'uuid1-file.txt'))).toBe(true);
    expect(fs.existsSync(path.join(uploadsDir, 'uuid2-image.png'))).toBe(true);
  });

  it('migrates a project to new directory structure', async () => {
    setupOldStructure({
      projects: [{ id: 'proj-1', context: '# My context', summary: 'You are building...' }],
    });

    const report = await runMigration({ dataDir: tmpDir });
    expect(report.projectsMigrated).toBe(1);

    const newDir = path.join(tmpDir, 'project-proj-1');
    expect(fs.existsSync(path.join(newDir, 'meta.json'))).toBe(true);
    expect(fs.readFileSync(path.join(newDir, 'context.md'), 'utf8')).toBe('# My context');
    expect(fs.readFileSync(path.join(newDir, 'summary.md'), 'utf8')).toBe('You are building...');
  });

  it('handles missing optional context.md and summary.md gracefully', async () => {
    setupOldStructure({
      projects: [{ id: 'proj-2' }],
    });

    const report = await runMigration({ dataDir: tmpDir });
    expect(report.projectsMigrated).toBe(1);
    expect(report.errors).toHaveLength(0);
  });

  it('archives chat markdown files to summaries/archive/', async () => {
    setupOldStructure({
      chatFiles: ['2026-W01.md', '2026-W02.md'],
    });

    const report = await runMigration({ dataDir: tmpDir });
    expect(report.chatsArchived).toBe(2);

    const archiveDir = path.join(tmpDir, 'summaries', 'archive');
    expect(fs.existsSync(path.join(archiveDir, '2026-W01.md'))).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, '2026-W02.md'))).toBe(true);
  });

  it('is idempotent — running twice produces the same result', async () => {
    setupOldStructure({
      conversations: [{ id: 'conv-idem', messages: 'msg' }],
    });

    const report1 = await runMigration({ dataDir: tmpDir });
    const report2 = await runMigration({ dataDir: tmpDir });

    expect(report1.conversationsMigrated).toBe(1);
    expect(report2.conversationsMigrated).toBe(0); // skipped on second run
    expect(report2.errors).toHaveLength(0);

    // File should still exist and be valid
    expect(fs.existsSync(path.join(tmpDir, 'conversation-conv-idem', 'conversation.ndjson'))).toBe(true);
  });

  it('dry-run makes no filesystem changes', async () => {
    setupOldStructure({
      conversations: [{ id: 'conv-dry', messages: 'msg' }],
    });

    const before = fs.readdirSync(tmpDir).sort();
    await runMigration({ dryRun: true, dataDir: tmpDir });
    const after = fs.readdirSync(tmpDir).sort();

    expect(after).toEqual(before);
    expect(fs.existsSync(path.join(tmpDir, 'conversation-conv-dry'))).toBe(false);
  });

  it('dry-run still reports what would be migrated', async () => {
    setupOldStructure({
      conversations: [{ id: 'conv-dry2', messages: '' }],
      projects: [{ id: 'proj-dry' }],
    });

    const report = await runMigration({ dryRun: true, dataDir: tmpDir });
    expect(report.conversationsMigrated).toBe(1);
    expect(report.projectsMigrated).toBe(1);
  });

  it('handles empty DATA_DIR gracefully', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir);
    const report = await runMigration({ dataDir: emptyDir });
    expect(report.conversationsMigrated).toBe(0);
    expect(report.errors).toHaveLength(0);
  });
});

describe('verifyMigration', () => {
  it('reports ok when all required files exist', () => {
    const id = 'conv-ok';
    const convDir = path.join(tmpDir, `conversation-${id}`);
    fs.mkdirSync(path.join(convDir, 'uploads'), { recursive: true });
    fs.mkdirSync(path.join(convDir, 'downloads'), { recursive: true });
    fs.writeFileSync(path.join(convDir, 'meta.json'), '{}');
    fs.writeFileSync(path.join(convDir, 'conversation.ndjson'), '');

    const result = verifyMigration(tmpDir);
    expect(result.ok).toBe(1);
    expect(result.bad).toBe(0);
  });

  it('reports bad when required files are missing', () => {
    const id = 'conv-bad';
    fs.mkdirSync(path.join(tmpDir, `conversation-${id}`), { recursive: true });
    // Missing meta.json, conversation.ndjson, uploads/, downloads/

    const result = verifyMigration(tmpDir);
    expect(result.bad).toBe(1);
    expect(result.issues[0]).toContain('missing');
  });

  it('returns empty result for nonexistent dir', () => {
    const result = verifyMigration('/nonexistent/path/abc');
    expect(result.ok).toBe(0);
    expect(result.bad).toBe(0);
  });
});
