import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const MAX_TEXT_CHARS = 50_000;

export interface FileContext {
  filename: string;
  mimeType: string;
  isImage: boolean;
  textContent?: string;
  base64?: string;
}

export async function extractContext(
  filePath: string,
  mimeType: string,
  filename: string,
): Promise<FileContext> {
  if (mimeType.startsWith('image/')) {
    const base64 = fs.readFileSync(filePath).toString('base64');
    return { filename, mimeType, isImage: true, base64 };
  }

  if (mimeType === 'application/pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const data = fs.readFileSync(filePath);
      const parsed = await pdfParse(data);
      const raw = parsed.text;
      const truncated = raw.length > MAX_TEXT_CHARS;
      const text = raw.slice(0, MAX_TEXT_CHARS) + (truncated ? `\n\n[Content truncated — first ${MAX_TEXT_CHARS} characters shown]` : '');
      return { filename, mimeType, isImage: false, textContent: text };
    } catch (err) {
      logger.error('PDF parse failed:', err);
      return { filename, mimeType, isImage: false, textContent: '[Could not extract text from this PDF]' };
    }
  }

  // Text / code / JSON / CSV etc.
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const truncated = raw.length > MAX_TEXT_CHARS;
    const text = raw.slice(0, MAX_TEXT_CHARS) + (truncated ? `\n\n[Content truncated — first ${MAX_TEXT_CHARS} characters shown]` : '');
    return { filename, mimeType, isImage: false, textContent: text };
  } catch {
    return { filename, mimeType, isImage: false, textContent: '[Binary content cannot be displayed as text]' };
  }
}

export function formatContextBlock(ctx: FileContext): string {
  if (ctx.isImage) return '';
  const ext = path.extname(ctx.filename).slice(1).toLowerCase();
  const fence = ext ? `\`\`\`${ext}` : '```';
  return `[Attached file: ${ctx.filename}]\n---\n${fence}\n${ctx.textContent ?? ''}\n\`\`\`\n---`;
}

export function findConversationFile(
  conversationDir: string,
  fileId: string,
): { filePath: string; filename: string } | null {
  if (!fs.existsSync(conversationDir)) return null;
  const files = fs.readdirSync(conversationDir).filter(
    (f) => !f.endsWith('.ndjson') && !f.endsWith('.json'),
  );
  const match = files.find((f) => f.startsWith(`${fileId}-`));
  if (!match) return null;
  const originalName = match.slice(fileId.length + 1);
  return { filePath: path.join(conversationDir, match), filename: originalName };
}
