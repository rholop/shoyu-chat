import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SearchExtractor } from './searchExtractor';

vi.mock('pdf-parse', () => {
  const mock = (buf: Buffer) => Promise.resolve({ text: 'Extracted PDF Content' });
  // @ts-ignore
  mock.default = mock;
  return mock;
});

describe('SearchExtractor', () => {
  it('should chunk text correctly', () => {
    const text = 'abcdefghij';
    const chunks = SearchExtractor.chunkText(text, 3);
    expect(chunks).toEqual(['abc', 'def', 'ghi', 'j']);
  });

  it('should create snippets', () => {
    const text = 'This is a long text that should be snippeted';
    const snippet = SearchExtractor.createSnippet(text, 10);
    expect(snippet).toBe('This is a ...');
  });

  it('should extract text from text-like files', async () => {
    const tempFile = path.join(__dirname, 'test.txt');
    fs.writeFileSync(tempFile, 'Hello World');
    const content = await SearchExtractor.extractFileContent(tempFile);
    expect(content).toBe('Hello World');
    fs.unlinkSync(tempFile);
  });

  it('should limit content and add truncation marker', async () => {
    const longText = 'a'.repeat(50001);
    const tempFile = path.join(__dirname, 'long.txt');
    fs.writeFileSync(tempFile, longText);
    const content = await SearchExtractor.extractFileContent(tempFile);
    expect(content.length).toBe(50000 + '[TRUNCATED]'.length);
    expect(content.endsWith('[TRUNCATED]')).toBe(true);
    fs.unlinkSync(tempFile);
  });

  it('should extract text from PDF files', async () => {
    const tempFile = path.join(__dirname, 'test.pdf');
    // Using a minimal valid PDF structure to satisfy the mock/real parser if it's not fully mocked
    const minimalPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/Font <<\n/F1 <<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\n>>\n>>\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 12 Tf\n72 712 Td\n(Extracted PDF Content) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000251 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n345\n%%EOF');
    fs.writeFileSync(tempFile, minimalPdf);
    const content = await SearchExtractor.extractFileContent(tempFile);
    expect(content).toContain('Extracted PDF Content');
    fs.unlinkSync(tempFile);
  });

  it('should create records from a message', () => {
    const message = {
      role: 'user' as const,
      content: 'Hello world',
      created_at: new Date().toISOString()
    };
    const records = SearchExtractor.fromMessage('conv1', 'Title', 'proj1', 'ProjName', message, 0);
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('conversation');
    expect(records[0].content).toBe('Hello world');
  });

  it('should not index internal messages', () => {
    const message = {
      role: 'internal' as const,
      content: 'System info',
      created_at: new Date().toISOString()
    };
    const records = SearchExtractor.fromMessage('conv1', 'Title', undefined, undefined, message, 0);
    expect(records).toHaveLength(0);
  });
});
