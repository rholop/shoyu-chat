CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL DEFAULT 'New Conversation',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
  content         TEXT    NOT NULL,
  model_used      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Tracks free-tier API usage per provider per UTC day
-- provider keys: 'groq-chat', 'groq-summary', 'gemini', 'openrouter'
CREATE TABLE IF NOT EXISTS api_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  provider      TEXT    NOT NULL,
  date          TEXT    NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(provider, date)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv         ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user    ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_prov_date   ON api_usage(provider, date);
