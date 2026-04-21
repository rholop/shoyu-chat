import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../../data');
const DB_PATH = path.join(DATA_DIR, 'db', 'chat.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Users ─────────────────────────────────────────────────────────────────────

export function getUserByUsername(username: string) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string; email: string }
    | undefined;
}

export function createUser(username: string, passwordHash: string, email: string) {
  return db
    .prepare('INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)')
    .run(username, passwordHash, email);
}

// ── Conversations ─────────────────────────────────────────────────────────────

export function getConversations(userId: number) {
  return db
    .prepare(
      `SELECT c.*, (
         SELECT model_used FROM messages
         WHERE conversation_id = c.id AND model_used IS NOT NULL
         ORDER BY created_at DESC LIMIT 1
       ) AS model_last_used
       FROM conversations c
       WHERE c.user_id = ?
       ORDER BY c.updated_at DESC`
    )
    .all(userId) as Array<{
    id: number;
    user_id: number;
    title: string;
    created_at: string;
    updated_at: string;
    model_last_used: string | null;
  }>;
}

export function getConversationById(id: number, userId: number) {
  return db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .get(id, userId) as
    | { id: number; user_id: number; title: string; created_at: string; updated_at: string }
    | undefined;
}

export function getConversationByIdInternal(id: number) {
  return db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as
    | { id: number; user_id: number; title: string; created_at: string; updated_at: string }
    | undefined;
}

export function createConversation(userId: number) {
  const result = db
    .prepare('INSERT INTO conversations (user_id) VALUES (?)')
    .run(userId);
  return result.lastInsertRowid as number;
}

export function updateConversationTitle(id: number, userId: number, title: string) {
  return db
    .prepare('UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, id, userId);
}

export function touchConversation(id: number) {
  db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function deleteConversation(id: number, userId: number) {
  return db
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(id, userId);
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function getMessages(conversationId: number) {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as Array<{
    id: number;
    conversation_id: number;
    role: 'user' | 'assistant';
    content: string;
    model_used: string | null;
    created_at: string;
  }>;
}

export function insertMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string,
  modelUsed?: string
) {
  const result = db
    .prepare(
      'INSERT INTO messages (conversation_id, role, content, model_used) VALUES (?, ?, ?, ?)'
    )
    .run(conversationId, role, content, modelUsed ?? null);
  return result.lastInsertRowid as number;
}

// ── API Usage ─────────────────────────────────────────────────────────────────

export function getUsageCount(provider: string, date: string): number {
  const row = db
    .prepare('SELECT request_count FROM api_usage WHERE provider = ? AND date = ?')
    .get(provider, date) as { request_count: number } | undefined;
  return row?.request_count ?? 0;
}

export function incrementUsage(provider: string, date: string) {
  db.prepare(
    `INSERT INTO api_usage (provider, date, request_count) VALUES (?, ?, 1)
     ON CONFLICT(provider, date) DO UPDATE SET request_count = request_count + 1`
  ).run(provider, date);
}

// ── Boot recovery: conversations active within the last 4h ───────────────────

export function getRecentlyActiveConversations(withinMs: number) {
  const cutoff = new Date(Date.now() - withinMs).toISOString().replace('T', ' ').slice(0, 19);
  return db
    .prepare("SELECT id FROM conversations WHERE updated_at >= ?")
    .all(cutoff) as Array<{ id: number }>;
}

export default db;
