import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(__dirname, '../../../data');
}

function conversationsDir() {
  const d = path.join(dataDir(), 'conversations');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function atomicWrite(filePath: string, content: string) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── User ──────────────────────────────────────────────────────────────────────

export interface UserRecord {
  username: string;
  password_hash: string;
  email: string;
  created_at: string;
}

export function readUser(): UserRecord | null {
  const p = path.join(dataDir(), 'user.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as UserRecord;
  } catch {
    return null;
  }
}

export function writeUser(user: UserRecord) {
  fs.mkdirSync(dataDir(), { recursive: true });
  atomicWrite(path.join(dataDir(), 'user.json'), JSON.stringify(user, null, 2));
}

// ── API Usage ─────────────────────────────────────────────────────────────────

type UsageData = Record<string, Record<string, number>>;

function readUsageRaw(): UsageData {
  const p = path.join(dataDir(), 'usage.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as UsageData;
  } catch {
    return {};
  }
}

export function getUsageCount(provider: string, date: string): number {
  return readUsageRaw()[provider]?.[date] ?? 0;
}

export function incrementUsage(provider: string, date: string) {
  const usage = readUsageRaw();
  if (!usage[provider]) usage[provider] = {};
  usage[provider][date] = (usage[provider][date] ?? 0) + 1;
  fs.mkdirSync(dataDir(), { recursive: true });
  atomicWrite(path.join(dataDir(), 'usage.json'), JSON.stringify(usage, null, 2));
}

// ── Conversation metadata ─────────────────────────────────────────────────────

export interface ConversationMeta {
  id: string;
  title: string;
  created_at: string;
}

export interface ConversationSummary extends ConversationMeta {
  updated_at: string;
  model_last_used: string | null;
}

function metaPath(id: string) {
  return path.join(conversationsDir(), `${id}.json`);
}

function ndjsonPath(id: string) {
  return path.join(conversationsDir(), `${id}.ndjson`);
}

export function listConversations(): ConversationSummary[] {
  const dir = conversationsDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  const results: ConversationSummary[] = [];
  for (const file of files) {
    const id = file.slice(0, -5); // strip .json
    const meta = getConversationMeta(id);
    if (!meta) continue;

    const ndPath = ndjsonPath(id);
    const stat = fs.existsSync(ndPath) ? fs.statSync(ndPath) : null;
    const updated_at = stat?.mtime.toISOString() ?? meta.created_at;

    let model_last_used: string | null = null;
    if (stat && stat.size > 0) {
      const content = fs.readFileSync(ndPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const msg = JSON.parse(lines[i]) as StoredMessage;
          if (msg.role === 'assistant' && msg.model) {
            model_last_used = msg.model;
            break;
          }
        } catch {
          // malformed line
        }
      }
    }

    results.push({ ...meta, updated_at, model_last_used });
  }

  return results.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getConversationMeta(id: string): ConversationMeta | null {
  const p = metaPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as ConversationMeta;
  } catch {
    return null;
  }
}

export function createConversation(): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const meta: ConversationMeta = { id, title: 'New Conversation', created_at: now };
  atomicWrite(metaPath(id), JSON.stringify(meta, null, 2));
  fs.writeFileSync(ndjsonPath(id), '', 'utf8');
  return id;
}

export function updateConversationTitle(id: string, title: string): boolean {
  const meta = getConversationMeta(id);
  if (!meta) return false;
  meta.title = title;
  atomicWrite(metaPath(id), JSON.stringify(meta, null, 2));
  return true;
}

export function deleteConversation(id: string): boolean {
  const mp = metaPath(id);
  if (!fs.existsSync(mp)) return false;
  fs.rmSync(mp, { force: true });
  fs.rmSync(ndjsonPath(id), { force: true });
  return true;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface StoredMessage {
  role: 'user' | 'assistant' | 'internal';
  content: string;
  model?: string;
  created_at: string;
}

export function getMessages(id: string): StoredMessage[] {
  const p = ndjsonPath(id);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as StoredMessage];
      } catch {
        return [];
      }
    });
}

export function appendMessage(id: string, msg: StoredMessage) {
  fs.appendFileSync(ndjsonPath(id), JSON.stringify(msg) + '\n', 'utf8');
}

// ── Boot recovery ─────────────────────────────────────────────────────────────

export function getRecentlyActiveConversations(withinMs: number): string[] {
  const dir = conversationsDir();
  if (!fs.existsSync(dir)) return [];
  const cutoff = Date.now() - withinMs;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ndjson'))
    .filter((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return stat.mtimeMs > cutoff && stat.size > 0;
    })
    .map((f) => f.slice(0, -7)); // strip .ndjson
}
