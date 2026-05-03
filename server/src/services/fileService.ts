import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  conversationDownloadsDir,
  conversationFilesDir,
  getConversationMeta,
  listConversations,
} from '../storage';
import { logger } from '../utils/logger';

const DEFAULT_MAX_TEXT_CHARS = 50_000;

export interface FileContext {
  filename: string;
  mimeType: string;
  isImage: boolean;
  textContent?: string;
  base64?: string;
}

export interface DownloadEntry {
  fileId: string;
  filename: string;
  description?: string;
  version: number;
  updated: boolean;
  size?: number;
  created_at?: string;
}

export interface ProjectDownloadEntry extends DownloadEntry {
  conversationId: string;
  conversationTitle: string;
}

export async function extractContext(
  filePath: string,
  mimeType: string,
  filename: string,
  maxChars: number = DEFAULT_MAX_TEXT_CHARS,
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
      const truncated = raw.length > maxChars;
      const text = raw.slice(0, maxChars) + (truncated ? `\n\n[Content truncated — first ${maxChars} characters shown]` : '');
      return { filename, mimeType, isImage: false, textContent: text };
    } catch (err) {
      logger.error('PDF parse failed:', err);
      return { filename, mimeType, isImage: false, textContent: '[Could not extract text from this PDF]' };
    }
  }

  // Text / code / JSON / CSV etc.
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const truncated = raw.length > maxChars;
    const text = raw.slice(0, maxChars) + (truncated ? `\n\n[Content truncated — first ${maxChars} characters shown]` : '');
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

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .substring(0, 200);
}

export async function writeDownload(
  conversationId: string,
  filename: string,
  content: string,
  description: string,
  existingFileId?: string,
): Promise<DownloadEntry> {
  const downloadsDir = conversationDownloadsDir(conversationId);
  const versionsDir = path.join(downloadsDir, '.versions');
  await fs.promises.mkdir(versionsDir, { recursive: true });

  const safe = sanitizeFilename(filename);

  if (existingFileId) {
    const currentPath = path.join(downloadsDir, `${existingFileId}-${safe}`);

    const existing = await fs.promises.readdir(versionsDir);
    const versions = existing.filter((f) => f.startsWith(`${existingFileId}-v`));
    const nextVersion = versions.length + 1;

    if (fs.existsSync(currentPath)) {
      await fs.promises.rename(
        currentPath,
        path.join(versionsDir, `${existingFileId}-v${nextVersion}-${safe}`),
      );
    }

    const allVersions = (await fs.promises.readdir(versionsDir))
      .filter((f) => f.startsWith(`${existingFileId}-v`))
      .sort();
    if (allVersions.length > 3) {
      const toDelete = allVersions.slice(0, allVersions.length - 3);
      await Promise.all(toDelete.map((f) => fs.promises.unlink(path.join(versionsDir, f))));
    }

    await fs.promises.writeFile(currentPath, content, 'utf8');
    return {
      fileId: existingFileId,
      filename: safe,
      description,
      version: nextVersion + 1,
      updated: true,
    };
  } else {
    const fileId = randomUUID();
    const fullPath = path.join(downloadsDir, `${fileId}-${safe}`);
    await fs.promises.writeFile(fullPath, content, 'utf8');
    return { fileId, filename: safe, description, version: 1, updated: false };
  }
}

export async function getConversationDownloads(conversationId: string): Promise<DownloadEntry[]> {
  const downloadsDir = conversationDownloadsDir(conversationId);
  if (!fs.existsSync(downloadsDir)) return [];

  const entries: DownloadEntry[] = [];
  const files = await fs.promises.readdir(downloadsDir);

  for (const file of files) {
    if (file === '.versions') continue;
    const filePath = path.join(downloadsDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    // UUID is exactly 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (file.length < 38) continue; // too short to contain UUID + '-' + name
    const fileId = file.slice(0, 36);
    const filename = file.slice(37);

    entries.push({
      fileId,
      filename,
      version: 1,
      updated: false,
      size: stat.size,
      created_at: stat.mtime.toISOString(),
    });
  }

  return entries.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

export async function getProjectDownloads(projectId: string): Promise<ProjectDownloadEntry[]> {
  const conversations = listConversations().filter((c) => c.projectId === projectId);
  const results: ProjectDownloadEntry[] = [];

  for (const conv of conversations) {
    const downloads = await getConversationDownloads(conv.id);
    for (const dl of downloads) {
      results.push({
        ...dl,
        conversationId: conv.id,
        conversationTitle: conv.title,
      });
    }
  }

  return results.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}
