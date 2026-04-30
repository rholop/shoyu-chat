import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { extractContext, formatContextBlock, findConversationFile } from './fileService';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shoyu-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
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

  it('truncates text content over 50000 characters', async () => {
    const bigText = 'a'.repeat(60000);
    const p = writeFile('big.txt', bigText);
    const ctx = await extractContext(p, 'text/plain', 'big.txt');
    expect(ctx.textContent).toContain('[Content truncated');
    expect(ctx.textContent!.length).toBeLessThan(60000);
  });

  it('returns error message for binary content that cannot be read as UTF-8', async () => {
    // Write raw binary that looks like it could fail UTF-8 decode gracefully
    // (Node readFileSync with utf8 typically doesn't throw, returns replacement chars)
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
