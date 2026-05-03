import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock storage so path helpers point to our tmpDir
vi.mock('../storage', () => ({
  conversationDownloadsDir: vi.fn(),
  conversationFilesDir: vi.fn(),
  getConversationMeta: vi.fn(),
  listConversations: vi.fn(),
}));

import { extractContext, formatContextBlock, findConversationFile, writeDownload, getConversationDownloads, sanitizeFilename, getProjectDownloads } from './fileService';
import { conversationDownloadsDir, listConversations } from '../storage';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoyu-test-'));
  // By default, point conversationDownloadsDir to a subdirectory of tmpDir
  vi.mocked(conversationDownloadsDir).mockImplementation((id: string) =>
    path.join(tmpDir, `conversation-${id}`, 'downloads'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function writeFile(name: string, content: string | Buffer): string {
  const p = path.join(tmpDir, name);
  if (typeof content === 'string') {
    fs.writeFileSync(p, content, 'utf8');
  } else {
    fs.writeFileSync(p, content);
  }
  return p;
}

describe('extractContext', () => {
  it('returns base64 for image files', async () => {
    const imgData = Buffer.from([137, 80, 78, 71]); // PNG magic bytes
    const p = writeFile('test.png', imgData);
    const ctx = await extractContext(p, 'image/png', 'test.png');
    expect(ctx.isImage).toBe(true);
    expect(ctx.base64).toBe(imgData.toString('base64'));
    expect(ctx.textContent).toBeUndefined();
  });

  it('reads text content for text/plain files', async () => {
    const p = writeFile('readme.txt', 'Hello, world!');
    const ctx = await extractContext(p, 'text/plain', 'readme.txt');
    expect(ctx.isImage).toBe(false);
    expect(ctx.textContent).toBe('Hello, world!');
  });

  it('reads text content for application/json files', async () => {
    const p = writeFile('data.json', '{"key": "value"}');
    const ctx = await extractContext(p, 'application/json', 'data.json');
    expect(ctx.isImage).toBe(false);
    expect(ctx.textContent).toBe('{"key": "value"}');
  });

  it('truncates text content at the default 50 000 char limit', async () => {
    const bigText = 'a'.repeat(60_000);
    const p = writeFile('big.txt', bigText);
    const ctx = await extractContext(p, 'text/plain', 'big.txt');
    expect(ctx.textContent).toContain('[Content truncated');
    expect(ctx.textContent!.length).toBeLessThan(60_000);
  });

  it('respects a custom maxChars limit', async () => {
    const text = 'x'.repeat(1_000);
    const p = writeFile('medium.txt', text);
    const ctx = await extractContext(p, 'text/plain', 'medium.txt', 500);
    expect(ctx.textContent).toContain('[Content truncated');
    expect(ctx.textContent!.startsWith('x'.repeat(500))).toBe(true);
  });

  it('does not truncate when content is within maxChars', async () => {
    const text = 'hello world';
    const p = writeFile('small.txt', text);
    const ctx = await extractContext(p, 'text/plain', 'small.txt', 500_000);
    expect(ctx.textContent).toBe('hello world');
    expect(ctx.textContent).not.toContain('[Content truncated');
  });

  it('returns error message for binary content that cannot be read as UTF-8', async () => {
    const p = writeFile('binary.bin', Buffer.from([0x80, 0x81, 0x82, 0x83]));
    const ctx = await extractContext(p, 'text/plain', 'binary.bin');
    expect(ctx.isImage).toBe(false);
    expect(typeof ctx.textContent).toBe('string');
  });

  it('returns fallback message when file does not exist', async () => {
    const ctx = await extractContext('/nonexistent/file.txt', 'text/plain', 'file.txt');
    expect(ctx.textContent).toContain('cannot');
  });
});

describe('formatContextBlock', () => {
  it('returns empty string for image contexts', () => {
    const ctx = { filename: 'img.png', mimeType: 'image/png', isImage: true, base64: 'abc' };
    expect(formatContextBlock(ctx)).toBe('');
  });

  it('wraps text content in a fenced block', () => {
    const ctx = { filename: 'script.ts', mimeType: 'text/typescript', isImage: false, textContent: 'const x = 1;' };
    const block = formatContextBlock(ctx);
    expect(block).toContain('[Attached file: script.ts]');
    expect(block).toContain('const x = 1;');
    expect(block).toContain('```');
  });

  it('includes language hint from extension', () => {
    const ctx = { filename: 'data.json', mimeType: 'application/json', isImage: false, textContent: '{}' };
    const block = formatContextBlock(ctx);
    expect(block).toContain('```json');
  });
});

describe('findConversationFile', () => {
  it('returns null when directory does not exist', () => {
    expect(findConversationFile('/nonexistent', 'some-uuid')).toBeNull();
  });

  it('returns null when no matching file exists', () => {
    expect(findConversationFile(tmpDir, '00000000-0000-0000-0000-000000000001')).toBeNull();
  });

  it('finds a file by its UUID prefix', () => {
    const uuid = '12345678-0000-0000-0000-000000000001';
    writeFile(`${uuid}-report.pdf`, 'pdf content');
    const result = findConversationFile(tmpDir, uuid);
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('report.pdf');
    expect(result!.filePath).toContain(uuid);
  });

  it('ignores .ndjson and .json files', () => {
    writeFile('conversation.ndjson', '{}');
    writeFile('metadata.json', '{}');
    expect(findConversationFile(tmpDir, 'conversation')).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('removes path traversal sequences', () => {
    expect(sanitizeFilename('../etc/passwd')).not.toContain('..');
  });

  it('replaces hidden file leading dot', () => {
    expect(sanitizeFilename('.hidden')).not.toMatch(/^\./);
  });

  it('replaces unsafe characters', () => {
    const result = sanitizeFilename('file name!@#.txt');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('!');
    expect(result).not.toContain('@');
    expect(result).not.toContain('#');
  });

  it('keeps safe characters', () => {
    expect(sanitizeFilename('script.py')).toBe('script.py');
    expect(sanitizeFilename('my-report_v2.md')).toBe('my-report_v2.md');
  });

  it('truncates to 200 characters', () => {
    const long = 'a'.repeat(300) + '.txt';
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });
});

describe('writeDownload', () => {
  it('creates a new file in downloads/ when no fileId provided', async () => {
    const result = await writeDownload('conv-1', 'script.py', 'print("hello")', 'A Python script');
    expect(result.fileId).toBeTruthy();
    expect(result.filename).toBe('script.py');
    expect(result.version).toBe(1);
    expect(result.updated).toBe(false);

    const downloadsDir = conversationDownloadsDir('conv-1');
    const files = fs.readdirSync(downloadsDir).filter((f) => f !== '.versions');
    expect(files.some((f) => f.includes('script.py'))).toBe(true);
  });

  it('sanitizes dangerous filenames', async () => {
    const result = await writeDownload('conv-1', '../../../etc/passwd', 'root:x', 'Bad file');
    expect(result.filename).not.toContain('..');
    expect(result.filename).not.toContain('/');
  });

  it('creates downloads/ and .versions/ directories if missing', async () => {
    await writeDownload('conv-new', 'file.txt', 'content', 'desc');
    const downloadsDir = conversationDownloadsDir('conv-new');
    expect(fs.existsSync(downloadsDir)).toBe(true);
    expect(fs.existsSync(path.join(downloadsDir, '.versions'))).toBe(true);
  });

  it('overwrites existing file when fileId is provided', async () => {
    const first = await writeDownload('conv-1', 'report.md', '# v1', 'Report v1');
    const second = await writeDownload('conv-1', 'report.md', '# v2', 'Report v2', first.fileId);

    expect(second.fileId).toBe(first.fileId);
    expect(second.updated).toBe(true);
    expect(second.version).toBeGreaterThan(1);

    const downloadsDir = conversationDownloadsDir('conv-1');
    const filePath = path.join(downloadsDir, `${first.fileId}-report.md`);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('# v2');
  });

  it('moves old version to .versions/ before overwriting', async () => {
    const first = await writeDownload('conv-1', 'script.py', 'v1', 'Script');
    await writeDownload('conv-1', 'script.py', 'v2', 'Script', first.fileId);

    const downloadsDir = conversationDownloadsDir('conv-1');
    const versionsDir = path.join(downloadsDir, '.versions');
    const versionedFiles = fs.readdirSync(versionsDir);
    expect(versionedFiles.some((f) => f.includes(first.fileId))).toBe(true);
  });

  it('increments version number correctly across multiple overwrites', async () => {
    const first = await writeDownload('conv-1', 'file.txt', 'v1', 'desc');
    const second = await writeDownload('conv-1', 'file.txt', 'v2', 'desc', first.fileId);
    const third = await writeDownload('conv-1', 'file.txt', 'v3', 'desc', first.fileId);

    expect(second.version).toBe(2);
    expect(third.version).toBe(3);
  });

  it('prunes .versions/ to max 3 — oldest deleted when 4th would be created', async () => {
    const first = await writeDownload('conv-1', 'file.txt', 'v1', 'desc');
    await writeDownload('conv-1', 'file.txt', 'v2', 'desc', first.fileId);
    await writeDownload('conv-1', 'file.txt', 'v3', 'desc', first.fileId);
    await writeDownload('conv-1', 'file.txt', 'v4', 'desc', first.fileId);
    await writeDownload('conv-1', 'file.txt', 'v5', 'desc', first.fileId);

    const downloadsDir = conversationDownloadsDir('conv-1');
    const versionsDir = path.join(downloadsDir, '.versions');
    const versionedFiles = fs.readdirSync(versionsDir).filter((f) => f.includes(first.fileId));
    expect(versionedFiles.length).toBeLessThanOrEqual(3);
  });
});

describe('getConversationDownloads', () => {
  it('returns empty array when downloads dir does not exist', async () => {
    vi.mocked(conversationDownloadsDir).mockReturnValueOnce('/nonexistent/path');
    const result = await getConversationDownloads('conv-1');
    expect(result).toEqual([]);
  });

  it('excludes .versions/ contents from listing', async () => {
    const dl = await writeDownload('conv-1', 'script.py', 'content', 'desc');
    await writeDownload('conv-1', 'script.py', 'content v2', 'desc', dl.fileId);

    const downloads = await getConversationDownloads('conv-1');
    const filenames = downloads.map((d) => d.filename);
    expect(filenames.every((f) => !f.includes('.versions'))).toBe(true);
    expect(downloads.length).toBe(1);
  });

  it('returns correct metadata for each download', async () => {
    await writeDownload('conv-1', 'report.md', '# Report', 'A report');
    const downloads = await getConversationDownloads('conv-1');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('report.md');
    expect(downloads[0].fileId).toBeTruthy();
    expect(downloads[0].size).toBeGreaterThan(0);
  });
});

describe('getProjectDownloads', () => {
  it('aggregates downloads from multiple conversations in the project', async () => {
    vi.mocked(listConversations).mockReturnValue([
      { id: 'conv-a', title: 'Conv A', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
      { id: 'conv-b', title: 'Conv B', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
      { id: 'conv-c', title: 'Other', projectId: 'proj-2', created_at: '', updated_at: '', model_last_used: null, has_files: false },
    ]);

    await writeDownload('conv-a', 'fileA.txt', 'content', 'desc');
    await writeDownload('conv-b', 'fileB.txt', 'content', 'desc');

    const downloads = await getProjectDownloads('proj-1');
    expect(downloads.length).toBe(2);
    expect(downloads.map((d) => d.conversationId).sort()).toEqual(['conv-a', 'conv-b'].sort());
  });

  it('does not include downloads from other projects', async () => {
    vi.mocked(listConversations).mockReturnValue([
      { id: 'conv-x', title: 'X', projectId: 'proj-other', created_at: '', updated_at: '', model_last_used: null, has_files: false },
    ]);

    await writeDownload('conv-x', 'secret.txt', 'secret', 'secret file');

    const downloads = await getProjectDownloads('proj-1');
    expect(downloads.length).toBe(0);
  });

  it('includes conversationTitle in each entry', async () => {
    vi.mocked(listConversations).mockReturnValue([
      { id: 'conv-t', title: 'My Chat', projectId: 'proj-1', created_at: '', updated_at: '', model_last_used: null, has_files: false },
    ]);

    await writeDownload('conv-t', 'output.py', 'x=1', 'desc');
    const downloads = await getProjectDownloads('proj-1');
    expect(downloads[0].conversationTitle).toBe('My Chat');
    expect(downloads[0].conversationId).toBe('conv-t');
  });
});
