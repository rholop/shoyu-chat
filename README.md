# shoyu-chat — Software Design

> A mobile-first AI chat PWA served at `holop.dev/chat`
> Single-user · Node.js/TypeScript backend · Groq + Gemini + OpenRouter + NVIDIA free tier routing

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Environment Variables](#3-environment-variables)
4. [Data Storage (Redesigned)](#4-data-storage-redesigned)
5. [Backend (Express + TypeScript)](#5-backend-express--typescript)
6. [AI Router](#6-ai-router)
7. [WRITE_FILE Tool](#7-write_file-tool)
8. [File Upload System](#8-file-upload-system)
9. [Projects](#9-projects)
10. [Markdown Summary System](#10-markdown-summary-system)
11. [Scheduler & Email](#11-scheduler--email)
12. [Auth System](#12-auth-system)
13. [Frontend (React PWA)](#13-frontend-react-pwa)
14. [Migration Script](#14-migration-script)
15. [Deployment](#15-deployment)

---

## 1. Project Overview

**shoyu-chat** is a mobile-first, desktop-compatible PWA served at `holop.dev/chat` by the `holop-web` Nginx configuration. This repo owns only the application — Nginx configuration lives in the `holop-web` repo.

Routes chat requests across Groq, Gemini, OpenRouter, and NVIDIA free tiers in priority order. Supports file and image uploads as conversation context. After 4 hours of conversation inactivity, summarizes the session to structured markdown files. Every Sunday at 11:59pm, a cron job emails a weekly digest. The AI router also exposes a `write_file` tool on every call, allowing the AI to create and version files directly into the conversation's downloads directory.

**Stack:**
- Frontend: React 18 + Vite + TypeScript + Zustand + TanStack Query
- Backend: Node.js + Express + TypeScript
- Storage: Filesystem (no database)
- Auth: JWT in `httpOnly` cookie + bcrypt
- Email: Resend
- Scheduler: `node-cron`
- Process manager: PM2 (managed externally, port 3001)
- Testing: Vitest (unit + integration), React Testing Library (component)

**Base path:** All frontend routes are under `/chat`, all API routes are under `/api`. Nginx in `holop-web` proxies both to this service on port 3001.

### Standards

**Tests:** Every service, route, utility, and non-trivial component must have a corresponding test file. Test files live adjacent to the source file they test (e.g. `aiRouter.test.ts` next to `aiRouter.ts`). No untested code ships.

---

## 2. Repository Structure

```
shoyu-chat/
├── client/
│   ├── public/
│   │   ├── manifest.json          # PWA manifest (start_url: /chat)
│   │   └── icons/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                # BrowserRouter basename="/chat"
│   │   ├── api/
│   │   │   ├── docs/
│   │   │   ├── auth.ts / auth.test.ts
│   │   │   ├── chat.ts / chat.test.ts
│   │   │   ├── conversations.ts / conversations.test.ts
│   │   │   ├── projects.ts / projects.test.ts
│   │   │   └── files.ts / files.test.ts
│   │   ├── components/
│   │   │   ├── docs/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx / AppShell.test.tsx
│   │   │   │   ├── Sidebar.tsx / Sidebar.test.tsx
│   │   │   │   └── TopBar.tsx / TopBar.test.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatView.tsx / ChatView.test.tsx
│   │   │   │   ├── MessageBubble.tsx / MessageBubble.test.tsx
│   │   │   │   ├── MessageInput.tsx / MessageInput.test.tsx
│   │   │   │   ├── AttachmentChip.tsx / AttachmentChip.test.tsx
│   │   │   │   └── ModelBadge.tsx / ModelBadge.test.tsx
│   │   │   ├── projects/
│   │   │   │   ├── docs/
│   │   │   │   ├── ProjectList.tsx / ProjectList.test.tsx
│   │   │   │   ├── ProjectDetail.tsx / ProjectDetail.test.tsx
│   │   │   │   └── ContextEditor.tsx / ContextEditor.test.tsx
│   │   │   └── auth/
│   │   │       ├── LoginScreen.tsx
│   │   │       └── LoginScreen.test.tsx
│   │   ├── hooks/
│   │   │   ├── docs/
│   │   │   ├── useAuth.ts / useAuth.test.ts
│   │   │   ├── useChat.ts / useChat.test.ts
│   │   │   ├── useConversations.ts / useConversations.test.ts
│   │   │   ├── useFileUpload.ts / useFileUpload.test.ts
│   │   │   ├── useProjects.ts / useProjects.test.ts
│   │   │   └── useFileDownload.ts / useFileDownload.test.ts   ← NEW
│   │   ├── store/
│   │   │   ├── docs/
│   │   │   ├── authStore.ts / authStore.test.ts
│   │   │   └── chatStore.ts / chatStore.test.ts
│   │   └── types/
│   │       ├── docs/
│   │       └── index.ts
│   ├── index.html
│   ├── vite.config.ts             # base: '/chat/'
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── docs/
│   │   │   ├── auth.ts / auth.test.ts
│   │   │   ├── chat.ts / chat.test.ts
│   │   │   ├── conversations.ts / conversations.test.ts
│   │   │   ├── files.ts / files.test.ts
│   │   │   └── projects.ts / projects.test.ts
│   │   ├── middleware/
│   │   │   ├── docs/
│   │   │   ├── authMiddleware.ts / authMiddleware.test.ts
│   │   │   ├── uploadMiddleware.ts / uploadMiddleware.test.ts
│   │   │   └── errorHandler.ts / errorHandler.test.ts
│   │   ├── services/
│   │   │   ├── docs/
│   │   │   ├── aiRouter.ts / aiRouter.test.ts
│   │   │   ├── groqService.ts / groqService.test.ts
│   │   │   ├── geminiService.ts / geminiService.test.ts
│   │   │   ├── openrouterService.ts / openrouterService.test.ts
│   │   │   ├── fileService.ts / fileService.test.ts
│   │   │   ├── summaryService.ts / summaryService.test.ts
│   │   │   ├── markdownService.ts / markdownService.test.ts
│   │   │   ├── emailService.ts / emailService.test.ts
│   │   │   ├── projectService.ts / projectService.test.ts
│   │   │   └── memoryService.ts / memoryService.test.ts
│   │   ├── jobs/
│   │   │   ├── docs/
│   │   │   ├── weeklyDigest.ts
│   │   │   └── weeklyDigest.test.ts
│   │   └── utils/
│   │       ├── docs/
│   │       ├── logger.ts / logger.test.ts
│   │       └── dateHelpers.ts / dateHelpers.test.ts
│   ├── tsconfig.json
│   └── package.json
│
├── data/                          # Lives on VPS, gitignored
│   ├── user.json
│   ├── usage.json
│   ├── user-memory.md             # Gitignored personal profile
│   │
│   ├── conversation-{id}/         # NEW: one self-contained directory per conversation
│   │   ├── meta.json              # Title, projectId, created_at
│   │   ├── conversation.ndjson    # Messages, append-only
│   │   ├── uploads/               # User-uploaded files
│   │   │   └── {fileId}-{filename}
│   │   └── downloads/             # AI-created files via WRITE_FILE
│   │       ├── {fileId}-{filename}
│   │       └── .versions/         # Previous versions (max 3 per file)
│   │           └── {fileId}-v{n}-{filename}
│   │
│   ├── project-{id}/              # NEW: one self-contained directory per project
│   │   ├── meta.json              # Name, description, created_at
│   │   ├── context.md             # User-written context document
│   │   └── summary.md             # AI-generated cross-conversation summary
│   │
│   └── summaries/
│       ├── YYYY-WXX.md
│       └── YYYY-MM.md
│
├── scripts/
│   ├── seed.ts
│   ├── seed-memory.ts
│   ├── migrate-data-structure.ts  # NEW: one-time migration script
│   └── backup.sh
│
├── docs/
│   ├── architecture.md
│   ├── ai-router.md
│   ├── file-uploads.md
│   ├── write-file-tool.md         # NEW
│   ├── summary-system.md
│   └── weekly-digest.md
│
├── .env.example
└── README.md
```

---

## 3. Environment Variables

**File:** `server/.env`

```bash
# Auth
JWT_SECRET=<64-char random hex string>

# AI APIs
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
NVIDIA_API_KEY=

# Daily request limits (per provider key — update if tiers change)
GROQ_CHAT_DAILY_LIMIT=1000
GEMINI_DAILY_LIMIT=1500
OPENROUTER_DAILY_LIMIT=200
NVIDIA_DAILY_LIMIT=1000

# File uploads
MAX_FILE_SIZE_MB=20
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,text/javascript,text/typescript,text/html,text/css

# Email
RESEND_API_KEY=
EMAIL_FROM=noreply@holop.dev
EMAIL_TO=<your personal email>

# App
PORT=3001
NODE_ENV=production
DATA_DIR=/home/user/shoyu-chat/data
TZ=America/New_York
```

---

## 4. Data Storage (Redesigned)

No database. All state lives in `$DATA_DIR` as plain files. Conversations and projects each live in **self-contained named directories** rather than flat sidecar files. A one-time migration script (see Section 14) transitions existing data.

### Full Layout

```
data/
├── user.json                          # Unchanged
├── usage.json                         # Unchanged
├── user-memory.md                     # Unchanged (gitignored)
│
├── conversation-{id}/                 # One directory per conversation
│   ├── meta.json                      # Metadata (title, projectId, created_at)
│   ├── conversation.ndjson            # Messages, append-only
│   ├── uploads/                       # User-uploaded files
│   │   └── {fileId}-{filename}
│   └── downloads/                     # AI-created files via WRITE_FILE
│       ├── {fileId}-{filename}
│       └── .versions/                 # Previous versions (max 3 per file)
│           └── {fileId}-v{n}-{filename}
│
├── project-{id}/                      # One directory per project
│   ├── meta.json                      # Metadata (name, description, created_at)
│   ├── context.md                     # User-written context document
│   └── summary.md                     # AI-generated cross-conversation summary
│
└── summaries/                         # Unchanged
    ├── YYYY-WXX.md
    └── YYYY-MM.md
```

### `data/user.json`
Single user record. Written once by seed script, read on every login.
```json
{
  "username": "admin",
  "password_hash": "$2b$12$...",
  "email": "you@example.com",
  "created_at": "2026-04-20T00:00:00Z"
}
```

### `data/usage.json`
API usage counters. Read and written on every AI call.
```json
{
  "groq-chat":   { "2026-04-20": 42 },
  "gemini":      { "2026-04-20": 12 },
  "openrouter":  { "2026-04-20": 3  },
  "nvidia":      { "2026-04-20": 7  }
}
```

### `data/user-memory.md`
**Gitignored.** Persistent personal profile injected as the first system message on every AI call. Written by `scripts/seed-memory.ts` and updated automatically by `memoryService` during the 4hr inactivity summarization run. Maximum 4,000 words.

```markdown
# User Memory

## Identity
Rowan Holop — Software Engineer

## Career
- Software Engineer II at JP Morgan Chase (Jul 2022 — Present)
- Focus: React, GraphQL, Java/Spring, AWS

## Projects
- shoyu-chat: personal AI chat PWA at holop.dev/chat
- holop.dev: personal website

## Personal
...
```

Seeded via `scripts/seed-memory.ts` using a local gitignored `seed-data.json`. Categories: Identity, Personal, Career, Finances, Timeline, and any custom sections.

**Privacy:** `data/user-memory.md` and `seed-data.json` must both be in `.gitignore`. The repo is public.

### `conversation-{id}/meta.json`
```json
{
  "id": "conversation-abc123",
  "title": "Refactoring the auth middleware",
  "projectId": "project-xyz789",
  "created_at": "2026-04-20T14:00:00Z"
}
```
`projectId` is `null` for unassigned conversations.

### `conversation-{id}/conversation.ndjson`
One file per conversation. Each line is a JSON message object. Append-only. Assistant messages that triggered `WRITE_FILE` include a `downloads` array. When a file is overwritten, `updated: true` is set and `version` is incremented so the UI can distinguish revisions from new files.

```ndjson
{"role":"user","content":"Write me a Python script...","created_at":"2026-04-20T14:00:00Z"}
{"role":"assistant","content":"Here's the script:","model":"groq-chat","created_at":"2026-04-20T14:00:01Z","downloads":[{"fileId":"f1","filename":"script.py","version":1}]}
{"role":"user","content":"Add error handling to script.py","created_at":"2026-04-20T15:00:00Z"}
{"role":"assistant","content":"Updated with error handling:","model":"groq-chat","created_at":"2026-04-20T15:00:01Z","downloads":[{"fileId":"f1","filename":"script.py","version":2,"updated":true}]}
{"role":"internal","content":"<search results>","created_at":"2026-04-20T14:00:02Z"}
```

### `conversation-{id}/uploads/`
User-uploaded files. Written by `uploadMiddleware`, read by `fileService` to extract context for AI calls. Files persist for the lifetime of the conversation and are deleted recursively when the conversation is deleted.

### `conversation-{id}/downloads/`
AI-created files. Written by `fileService.writeDownload()` when the AI invokes the `write_file` tool. Overwrites are versioned: the current file is moved to `.versions/` before being replaced. Max 3 versions are retained per file — the oldest is pruned when a 4th would be created. The active file always lives at `downloads/{fileId}-{filename}` regardless of version number.

### `project-{id}/meta.json`
```json
{
  "id": "project-xyz789",
  "name": "holop.dev rebuild",
  "description": "Rebuilding my personal website and chat app",
  "created_at": "2026-04-20T00:00:00Z"
}
```

### `project-{id}/context.md`
Freeform context document written by the user. Injected as a system prompt into every AI call within this project's conversations. User edits this directly in the app.

```markdown
# holop.dev rebuild

## Stack
- React + Vite frontend
- Node.js + Express backend
- Filesystem storage (no database)
- Hosted on DigitalOcean, served via Nginx

## Goals
- Personal website at holop.dev
- AI chat app at holop.dev/chat

## Conventions
- TypeScript everywhere
- Vitest for testing
- Every directory has a /docs folder
```

### `project-{id}/summary.md`
Auto-generated summary of all conversations in the project. Regenerated by the summary system after any conversation in the project is summarized. See Section 10.

### Conversation Operations

| Operation | Implementation |
|---|---|
| List conversations | `readdir` `data/`, filter `conversation-*/`, read each `meta.json`, sort by `conversation.ndjson` mtime |
| Load conversation | Read `conversation-{id}/conversation.ndjson`, parse lines |
| Append message | `fs.appendFile` to `conversation.ndjson` |
| Delete conversation | `rm -r conversation-{id}/` (removes ndjson, meta, uploads, downloads) |
| Upload file | Write to `conversation-{id}/uploads/{fileId}-{filename}` |
| Delete upload | `rm conversation-{id}/uploads/{fileId}-{filename}` |
| List downloads | `readdir` `downloads/`, exclude `.versions/` subdirectory |
| Get download | Stream `conversation-{id}/downloads/{fileId}-{filename}` |

---

## 5. Backend (Express + TypeScript)

### API Routes

#### Auth
```
POST /api/auth/login
  body: { username, password }
  reads user.json, verifies bcrypt hash
  sets httpOnly JWT cookie on success

POST /api/auth/logout
  clears cookie

GET  /api/auth/me
  validates session, returns username + email
```

#### Conversations
```
GET    /api/conversations
       returns [{ id, title, created_at, updated_at }]
       sorted by conversation.ndjson mtime descending

GET    /api/conversations/:id
       returns { meta, messages[] }

POST   /api/conversations
       creates conversation-{id}/ directory with:
         meta.json, conversation.ndjson, uploads/, downloads/, downloads/.versions/
       returns { id }

DELETE /api/conversations/:id
       rm -r conversation-{id}/ recursively

PATCH  /api/conversations/:id
       body: { title } — updates meta.json

POST   /api/conversations/:id/assign
       body: { projectId: string | null }
       updates projectId in meta.json
       null = remove from project

GET    /api/conversations/:id/downloads
       returns list of files in conversation-{id}/downloads/
       excludes .versions/ from listing
       response: [{ fileId, filename, description?, created_at, size }]

GET    /api/conversations/:id/downloads/:fileId
       streams file from conversation-{id}/downloads/{fileId}-{filename}
       sets Content-Disposition: attachment; filename="{filename}"
       sets appropriate Content-Type based on file extension
       returns 404 for missing file
       rejects path traversal in fileId/filename with 400
```

#### Chat
```
POST /api/chat/send
  body: { conversationId, content, attachmentIds?: string[] }
  streams SSE response

  Before routing to AI:
    1. Load conversation history from conversation.ndjson
    2. Load current downloads list → inject as context into system prompt
    3. For each attachmentId, load file and extract content (see §8)
    4. Inject user-memory.md as first system message
    5. Inject project context if conversation has a projectId

  After stream ends (async, non-blocking):
    - Process any write_file tool calls → fileService.writeDownload()
    - Append user message + assistant message (with downloads[]) to conversation.ndjson
    - Increment usage.json counter
    - summaryService.schedule(conversationId)
```

#### Files (Uploads)
```
POST /api/files/upload
  multipart/form-data: { file, conversationId }
  validates type + size
  writes to conversation-{id}/uploads/{fileId}-{filename}
  returns { fileId, filename, mimeType, size }

GET  /api/files/:conversationId/:fileId
  streams upload file back to client (for display/download)

DELETE /api/files/:conversationId/:fileId
  removes upload from disk
  does NOT modify conversation.ndjson (historical reference remains)
```

#### Projects
```
GET    /api/projects
       returns [{ id, name, description, created_at, conversationCount }]

GET    /api/projects/:id
       returns { meta, contextDoc, conversations[] }

POST   /api/projects
       body: { name, description }
       creates project-{id}/ with meta.json, empty context.md, empty summary.md
       returns { id }

DELETE /api/projects/:id
       deletes project-{id}/ directory
       conversations in this project have projectId set to null (not deleted)

PATCH  /api/projects/:id
       body: { name?, description? }
       updates meta.json

GET    /api/projects/:id/context
       returns raw markdown content of context.md

PUT    /api/projects/:id/context
       body: { content }
       atomic overwrite of context.md (.tmp → fs.rename)

GET    /api/projects/:id/downloads
       aggregates downloads across ALL conversations where projectId === id
       for each conversation: reads downloads/ directory + meta for title
       returns flat list sorted by created_at desc:
       [{ fileId, filename, description?, created_at, size, conversationId, conversationTitle }]
```

#### Admin
```
POST /api/admin/digest/trigger
  Manually triggers the weekly digest job (for testing)
```

### Request Lifecycle (Chat with Attachments)
```
1.  POST /api/chat/send received
2.  authMiddleware verifies JWT cookie
3.  Read conversation.ndjson → parse message history
4.  Load existing downloads list → inject into system prompt as context
5.  For each attachmentId in request:
    a. Determine file type
    b. Images → pass as base64 image content to AI (if model supports vision)
    c. Text/code/markdown/CSV/JSON → read file, inject as text block in context
    d. PDF → extract text via pdf-parse, inject as text block
6.  Call aiRouter.route(messages + file contexts + WRITE_FILE_TOOL) → stream response
7.  Extract write_file tool calls from response; process via fileService.writeDownload()
8.  Pipe SSE (text content) to client
9.  On stream end:
    a. Append both messages (with downloads[] metadata) to conversation.ndjson
    b. Increment usage.json
    c. summaryService.schedule(conversationId)
```

---

## 6. AI Router

**File:** `server/src/services/aiRouter.ts`

### Overview

The router classifies each message by intent using regex, then routes to the best available model for that intent via a tiered fallback matrix. If the user has manually selected a provider, that selection overrides intent-based routing. Every call includes the `WRITE_FILE_TOOL` unless the tier has `noTools: true`.

### Intent Classification

Regex-based classification runs on the user's message before every AI call. Intents are mutually exclusive — the first match wins.

| Intent | Triggers on... |
|---|---|
| `WEB_SEARCH` | "search", "look up", "current", "latest", "news", URLs |
| `CODING` | "code", "function", "implement", "build", "write a", language keywords |
| `DEBUGGING` | "error", "bug", "fix", "broken", "exception", "not working", stack traces |
| `TRANSLATING` | "translate", "in French/Spanish/etc", language names |
| `DRAFTING` | "write", "draft", "email", "essay", "letter", "post" |
| `SUMMARIZING` | "summarize", "summary", "tldr", "recap", "shorten" |
| `IMAGE_ANALYSIS` | Message includes image attachment (bypasses text regex) |

Default intent when no match: `DRAFTING` (general-purpose fallback).

### Fallback Matrix

Each intent has an ordered list of `TierConfig` — the router tries each in order, skipping tiers that are quota-exhausted or rate-limited.

```typescript
const FALLBACK_MATRIX: Record<Intent, TierConfig[]> = {
  [Intent.WEB_SEARCH]: [
    { provider: 'gemini',      model: 'gemini-2.5-flash',              label: 'Gemini: 2.5 Flash',        useSearch: true, searchTool: { google_search: {} }, vision: true },
    { provider: 'gemini',      model: 'gemini-2.5-pro',                label: 'Gemini: 2.5 Pro',          useSearch: true, searchTool: { google_search: {} }, vision: true },
    { provider: 'openrouter',  model: 'openai/gpt-oss-120b:free',      label: 'OR: GPT-oss-120b' },
  ],
  [Intent.CODING]: [
    { provider: 'nvidia',      model: 'meta/llama-3.3-70b-instruct',   label: 'NVIDIA: Llama 3.3 70B' },
    { provider: 'groq-chat',   model: 'llama-3.3-70b-versatile',       label: 'Groq: Llama 3.3 70B' },
    { provider: 'gemini',      model: 'gemini-2.5-pro',                label: 'Gemini: 2.5 Pro' },
  ],
  [Intent.DEBUGGING]: [
    { provider: 'groq-chat',   model: 'llama-3.3-70b-versatile',       label: 'Groq: Llama 3.3 70B',     trimContext: true },
    { provider: 'gemini',      model: 'gemini-2.5-flash',              label: 'Gemini: 2.5 Flash' },
    { provider: 'openrouter',  model: 'poolside/laguna-m.1:free',      label: 'OR: Laguna M.1' },
  ],
  [Intent.TRANSLATING]: [
    { provider: 'openrouter',  model: 'openai/gpt-oss-120b:free',      label: 'OR: GPT-oss-120b' },
    { provider: 'gemini',      model: 'gemini-2.5-pro',                label: 'Gemini: 2.5 Pro' },
    { provider: 'groq-chat',   model: 'llama-3.3-70b-versatile',       label: 'Groq: Llama 3.3 70B' },
  ],
  [Intent.DRAFTING]: [
    { provider: 'groq-chat',   model: 'llama-3.3-70b-versatile',       label: 'Groq: Llama 3.3 70B',     trimContext: true },
    { provider: 'gemini',      model: 'gemini-2.5-flash',              label: 'Gemini: 2.5 Flash' },
    { provider: 'nvidia',      model: 'meta/llama-3.1-70b-instruct',   label: 'NVIDIA: Llama 3.1 70B' },
  ],
  [Intent.SUMMARIZING]: [
    { provider: 'gemini',      model: 'gemini-2.5-flash',              label: 'Gemini: 2.5 Flash' },
    { provider: 'groq-chat',   model: 'llama-3.3-70b-versatile',       label: 'Groq: Llama 3.3 70B' },
    { provider: 'openrouter',  model: 'meta-llama/llama-3.2-3b-instruct:free', label: 'OR: Llama 3.2 3B' },
  ],
  [Intent.IMAGE_ANALYSIS]: [
    { provider: 'gemini',      model: 'gemini-2.5-flash',              label: 'Gemini: 2.5 Flash',        vision: true },
    { provider: 'gemini',      model: 'gemini-2.5-pro',                label: 'Gemini: 2.5 Pro',          vision: true },
    { provider: 'openrouter',  model: 'openai/gpt-oss-120b:free',      label: 'OR: GPT-oss-120b',         vision: true },
  ],
};
```

### TierConfig Fields

| Field | Type | Description |
|---|---|---|
| `provider` | string | Provider key: `groq-chat`, `gemini`, `openrouter`, `nvidia` |
| `model` | string | Exact model string passed to the API |
| `label` | string | Human-readable label shown in model badge in UI |
| `useSearch` | boolean | Enable Google Search grounding (Gemini only) |
| `searchTool` | object | Tool definition passed to Gemini for search |
| `vision` | boolean | This tier supports image input |
| `trimContext` | boolean | Trim older messages to reduce token count before sending |
| `noTools` | boolean | Omit `WRITE_FILE_TOOL` from request (e.g. Perplexity Sonar) |

### Routing Logic

```typescript
async function route(messages: Message[], intent: Intent, manualProvider?: string): Promise<AIResponse> {
  const today = getToday();
  const usage = readUsageFile();

  // Manual provider override — no fallback, surface error to user if it fails
  if (manualProvider) {
    return await callProvider(manualProvider, messages, today, usage);
  }

  // Intent-based routing with fallback
  const tiers = FALLBACK_MATRIX[intent];
  for (const tier of tiers) {
    const count = usage[tier.provider]?.[today] ?? 0;
    if (count >= getLimit(tier.provider)) continue;
    try {
      const result = await callTier(tier, messages);
      incrementUsage(tier.provider, today);
      return { ...result, model: tier.label };
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      // rate limited — try next tier
    }
  }

  throw new Error('QUOTA_EXCEEDED');
}
```

### Provider SDK Notes

**Groq** — `openai` npm package, `baseURL: 'https://api.groq.com/openai/v1'`

**NVIDIA** — `openai` npm package, `baseURL: 'https://integrate.api.nvidia.com/v1'`, requires `NVIDIA_API_KEY`

**OpenRouter** — `openai` npm package, `baseURL: 'https://openrouter.ai/api/v1'`, required headers:
```typescript
defaultHeaders: {
  'HTTP-Referer': 'https://holop.dev',
  'X-Title': 'shoyu-chat'
}
```

**Gemini** — `@google/generative-ai` SDK. Convert `{role, content}[]` to `contents: [{role, parts: [{text}]}]`. For vision, add `{inlineData: {mimeType, data: base64}}` to parts. For search, pass `tools: [{ google_search: {} }]`. Tool calling uses the `functionDeclarations` format (see Section 7).

### Internal Summarization

`aiRouter.summarize(prompt)` uses the `SUMMARIZING` intent matrix directly — no intent classification needed. This ensures summarization always uses the most appropriate models without consuming quota from chat-optimized tiers.

### User Memory Service

**File:** `server/src/services/memoryService.ts`

`data/user-memory.md` is a gitignored, freeform markdown file containing a persistent personal profile. It is prepended as the **first system message** on every AI call, above project context.

**Injection order:**
```
1. user-memory.md       ← personal context (always present if file exists)
2. project context      ← project-level context (if conversation has a projectId)
3. conversation history ← actual messages
```

**Update lifecycle:** During the 4hr inactivity summarization run, `memoryService.update(conversationId)` compares new conversation history against the existing memory file and merges new personal facts. Uses `SUMMARIZING` tier. Only permanent facts are merged — temporary topics, chat intentions, and session-specific details are excluded.

**Seeding:** `scripts/seed-memory.ts` initializes `data/user-memory.md` from a local gitignored `seed-data.json`. Categories: Identity, Personal, Career, Finances, Timeline, and any custom sections.

**File limit:** 4,000 words maximum. `memoryService` trims oldest/least-relevant sections if the limit is exceeded.

**Privacy:** `data/user-memory.md` and `seed-data.json` must both be in `.gitignore`. The repo is public.

### Context Relay (Internal Messages)

When `WEB_SEARCH` intent fires and Gemini executes a search, the raw search results are stored as `role: "internal"` lines in the `conversation.ndjson` file. Subsequent messages in the same conversation receive these internal messages as context, grounding later responses. The frontend `ChatView.tsx` filters out `role: "internal"` messages — users never see raw search results.

---

## 7. WRITE_FILE Tool

### Concept

Every AI intent can invoke a `write_file` tool during its response. The tool creates a new file or overwrites an existing one in `conversation-{id}/downloads/`. The AI receives a list of existing downloads as context on every call so it can detect when it should overwrite vs create new. The user can also explicitly request an update ("update script.py", "rewrite the report").

The AI can call `write_file` multiple times in a single response — e.g. to scaffold multiple files for a project.

**Overwrite detection:**
- If the AI passes a `fileId` that matches an existing download, it's an overwrite
- If no `fileId` is passed, it's a new file
- The AI infers `fileId` from the downloads context injected into its system prompt
- If the user says "update X" and the AI matches by filename, it passes back the existing `fileId`

**Versioning on overwrite:**
- Before overwriting, the current file is moved to `downloads/.versions/{fileId}-v{n}-{filename}`
- `n` is the version number (1-based, increments each overwrite)
- Only the last 3 versions are kept — the oldest is deleted when a 4th would be created
- The active file always lives at `downloads/{fileId}-{filename}` regardless of version

### Downloads Context Injection

Before every AI call, the current list of downloads for the conversation is injected into the system prompt so the AI knows what files exist:

```
## Files created in this conversation
- fileId: "f1", filename: "script.py", description: "Data processing script", version: 1
- fileId: "f2", filename: "report.md", description: "Weekly summary draft", version: 3
```

This enables the AI to pass back the correct `fileId` when the user asks to update a file, without the user having to specify it manually.

### Tool Definition

Passed to every AI call regardless of intent (except tiers where `noTools: true`):

```typescript
const WRITE_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'write_file',
    description: `Create a new file or overwrite an existing one, making it available for the user to download.
Use this whenever you generate code, scripts, documents, configs, or any content the user might want to save.
Prefer this over putting long file contents in the chat message.
If the user asks to update or modify a file you already created, pass its fileId to overwrite it instead of creating a duplicate.`,
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'The filename including extension. E.g. "script.py", "report.md", "config.json"'
        },
        content: {
          type: 'string',
          description: 'The full text content of the file.'
        },
        description: {
          type: 'string',
          description: 'One sentence describing what this file is and what it does.'
        },
        fileId: {
          type: 'string',
          description: 'If provided, overwrites the existing file with this ID instead of creating a new one. Use this when updating a file you already created in this conversation.'
        }
      },
      required: ['filename', 'content', 'description']
    }
  }
};
```

### Tool Invocation Flow

```
1. AI call is made with WRITE_FILE_TOOL + downloads context in system prompt
2. AI response may include one or more tool_use blocks alongside text
3. For each tool_use block with name 'write_file':

   IF fileId provided (overwrite):
     - Verify file exists at downloads/{fileId}-{filename}
     - Count existing versions to determine next version number
     - Move current file → downloads/.versions/{fileId}-v{n}-{filename}
     - Delete oldest version if more than 3 versions now exist
     - Write new content to downloads/{fileId}-{filename} (same path)
     - Set updated: true, increment version in response

   IF no fileId (new file):
     - Generate new fileId (UUID)
     - Sanitize filename
     - Write content to downloads/{fileId}-{filename}
     - Set updated: false, version: 1

4. Collect { fileId, filename, description, version, updated } into downloads[]
5. Append assistant message to conversation.ndjson:
   { role: 'assistant', content: '...', model: '...', downloads: [...], created_at: '...' }
6. Return response to client including downloads array
```

### Filename Sanitization

```typescript
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._\-]/g, '_')  // safe chars only
    .replace(/\.\./g, '_')               // no path traversal
    .replace(/^\./, '_')                 // no hidden files
    .substring(0, 200);                  // max length
}
```

### Provider-Specific Tool Handling

**Groq, NVIDIA, OpenRouter** — OpenAI-compatible tool calling:
```typescript
const response = await client.chat.completions.create({
  model,
  messages,
  tools: [WRITE_FILE_TOOL],
  tool_choice: 'auto'
});
// Extract tool calls from response.choices[0].message.tool_calls
```

**Gemini** — uses `functionDeclarations` format:
```typescript
const tools = [{
  functionDeclarations: [{
    name: 'write_file',
    description: WRITE_FILE_TOOL.function.description,
    parameters: WRITE_FILE_TOOL.function.parameters
  }]
}];
// Extract tool calls from response.candidates[0].content.parts
// where part.functionCall exists
```

**Perplexity Sonar via OpenRouter** — does not support tool calling. When the selected tier is `perplexity/sonar-pro`, omit `WRITE_FILE_TOOL` from the request entirely. The router checks `tier.noTools === true` before including the tool array.

### `fileService.writeDownload()`

Handles both new file creation and overwrites with versioning:

```typescript
async function writeDownload(
  conversationId: string,
  filename: string,
  content: string,
  description: string,
  existingFileId?: string
): Promise<{ fileId: string; filename: string; version: number; updated: boolean }> {
  const downloadsDir = path.join(DATA_DIR, `conversation-${conversationId}`, 'downloads');
  const versionsDir  = path.join(downloadsDir, '.versions');
  await fs.mkdir(versionsDir, { recursive: true });

  const safe = sanitizeFilename(filename);

  if (existingFileId) {
    // OVERWRITE — version the current file first
    const currentPath = path.join(downloadsDir, `${existingFileId}-{safe}`);

    const existing = await fs.readdir(versionsDir);
    const versions = existing.filter(f => f.startsWith(`${existingFileId}-v`));
    const nextVersion = versions.length + 1;

    await fs.rename(
      currentPath,
      path.join(versionsDir, `${existingFileId}-v${nextVersion}-{safe}`)
    );

    // Prune: keep only last 3 versions
    const allVersions = (await fs.readdir(versionsDir))
      .filter(f => f.startsWith(`${existingFileId}-v`))
      .sort();
    if (allVersions.length > 3) {
      const toDelete = allVersions.slice(0, allVersions.length - 3);
      await Promise.all(toDelete.map(f => fs.unlink(path.join(versionsDir, f))));
    }

    await fs.writeFile(currentPath, content, 'utf8');
    return { fileId: existingFileId, filename: safe, version: nextVersion + 1, updated: true };

  } else {
    // NEW FILE
    const fileId = randomUUID();
    const fullPath = path.join(downloadsDir, `${fileId}-{safe}`);
    await fs.writeFile(fullPath, content, 'utf8');
    return { fileId, filename: safe, version: 1, updated: false };
  }
}
```

---

## 8. File Upload System

**Files:** `server/src/services/fileService.ts`, `server/src/middleware/uploadMiddleware.ts`

### Upload Middleware
Uses `multer` with disk storage. Destination is now `conversation-{id}/uploads/`:
```typescript
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(DATA_DIR, `conversation-${req.body.conversationId}`, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const fileId = randomUUID();
    cb(null, `${fileId}-{file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  }
});
```

### File Processing for AI Context

**`fileService.extractContext(filePath, mimeType)`** returns content suitable for injection into an AI prompt:

| File type | Processing |
|---|---|
| `image/*` | Read as base64 — passed as image content block to vision-capable models |
| `application/pdf` | Extract text via `pdf-parse` — injected as `[File: filename.pdf]\n{text}` |
| `text/*`, `application/json` | Read as UTF-8 string — injected as fenced code block with language hint |
| Unknown | Attempt UTF-8 read; if binary, notify user the file can't be processed |

**Context injection format (non-image):**
```
[Attached file: report.pdf]
---
{extracted text content}
---
```

**File size limits for context:**
- Text/code files: inject full content up to 50K characters, truncate with notice if larger
- PDFs: extract up to first 50K characters of text
- Images: no truncation — base64 passed directly

### File Lifecycle
- Files are stored in `conversation-{id}/uploads/` for the lifetime of the conversation
- When a conversation is deleted, its entire directory (including all uploads and downloads) is removed
- Files are not shared between conversations
- No automatic expiry — deletion is tied to conversation deletion only

### Attachment Metadata in Messages
When a message includes attachments, the `conversation.ndjson` line stores references, not file content:
```json
{
  "role": "user",
  "content": "What does this chart show?",
  "attachments": [
    { "fileId": "uuid", "filename": "chart.png", "mimeType": "image/png", "size": 204800 }
  ],
  "created_at": "2026-04-20T14:00:00Z"
}
```

---

## 9. Projects

**Files:** `server/src/routes/projects.ts` + `server/src/services/projectService.ts`

### Concept

A project is a persistent context envelope. Conversations inside a project automatically receive the project's context document injected as a system prompt on every AI call. The AI always knows the project background without the user re-explaining it.

Projects are optional — conversations without a project float ungrouped in the sidebar as they do today.

### Data Files

```
data/project-{id}/
├── meta.json              # name, description, created_at
├── context.md             # freeform context doc, user-editable in the app
└── summary.md             # auto-generated cross-conversation summary
```

### API Routes

See Section 5 for full route definitions including the new `GET /api/projects/:id/downloads` aggregation route.

### Context Injection

When a chat request belongs to a project conversation, `projectService.getContext(projectId)` reads `context.md` and prepends it to the AI call as a system message:

```typescript
const messages: Message[] = [];

// 1. User memory — always first
if (userMemory) {
  messages.push({ role: 'system', content: userMemory });
}

// 2. Project context
if (conversation.projectId) {
  const context = await projectService.getContext(conversation.projectId);
  if (context) {
    messages.push({
      role: 'system',
      content: `# Project Context\n\n${context}`
    });
  }
}

// 3. Conversation history
messages.push(...conversationHistory);
```

This means the project context is invisible in the chat UI — it's background knowledge, not a visible message.

### Project Summary

After any conversation in a project is summarized (4hr inactivity debounce), `summaryService` regenerates `project-{id}/summary.md`:

```
Given these conversation summaries from a project called "{name}":
{list of one-liners from all conversations in this project}

Write a 3-5 sentence summary of:
1. What this project is working toward
2. What has been accomplished so far
3. What problems or questions have come up repeatedly
Write in second person ("You are building...").
```

This summary is included in the weekly digest email under a Projects section.

### `projectService.getProjectDownloads(projectId)`

1. List all `conversation-*/meta.json` files in `data/`
2. Filter those where `meta.projectId === projectId`
3. For each matching conversation, `readdir` its `downloads/` directory (excluding `.versions/`)
4. `stat` each file for size and `created_at` (file mtime)
5. Return flat sorted array with `conversationId` and `conversationTitle`

### UI Structure

**Sidebar:**
```
├── Projects
│   ├── holop.dev rebuild       ← collapsible
│   │   ├── Nginx config chat
│   │   └── VPS setup chat
│   └── Recipe app              ← collapsible
│       └── DB schema chat
└── Conversations
    ├── Bazzite drivers chat    ← ungrouped, as today
    └── Random question chat
```

- Projects section appears above ungrouped conversations
- Each project is collapsible, expanded by default
- Clicking a project name opens the Project Detail view
- "New Chat" inside a project creates a conversation pre-assigned to it
- Conversations can be reassigned via a context menu or detail panel

**Project Detail view** (`/chat/projects/:id`):
- Tabs: **[Context] [Conversations] [Downloads]**
- Context tab: editable project context document (plain textarea or minimal markdown editor)
- Conversations tab: list of conversations in the project
- Downloads tab: aggregated AI-created files across all conversations (see below)
- Auto-generated project summary (read-only, AI-generated)
- Delete project button (conversations are kept, just unassigned)

### Project Downloads Tab

Shows every file created by the AI across all conversations in this project, served from their original `conversation-{id}/downloads/` paths — no copies are made.

```
Downloads (12 files)
─────────────────────────────────────
📄 nginx.conf                        ↓
   From: "Nginx config discussion"
   Apr 20 · 2.1 KB

🐍 deploy.sh                         ↓
   From: "VPS deployment chat"
   Apr 19 · 890 B

📝 architecture.md                   ↓
   From: "System design session"
   Apr 18 · 4.3 KB
```

**File type icons:**

| Extension group | Icon |
|---|---|
| `.py`, `.ts`, `.js`, `.sh`, `.rb`, `.go`, `.rs` | 🐍 code icon |
| `.md`, `.txt`, `.rst` | 📝 |
| `.json`, `.yaml`, `.toml`, `.env` | ⚙️ |
| `.html`, `.css` | 🌐 |
| `.pdf` | 📕 |
| Everything else | 📄 |

---

## 10. Markdown Summary System

**Files:** `server/src/services/summaryService.ts` + `markdownService.ts`

### Inactivity Debounce

```typescript
const pendingTimers = new Map<string, NodeJS.Timeout>();
const INACTIVITY_MS = 4 * 60 * 60 * 1000; // 4 hours

export function schedule(conversationId: string) {
  if (pendingTimers.has(conversationId)) {
    clearTimeout(pendingTimers.get(conversationId));
  }
  const timer = setTimeout(async () => {
    pendingTimers.delete(conversationId);
    await runSummary(conversationId);
  }, INACTIVITY_MS);
  pendingTimers.set(conversationId, timer);
}
```

**On server boot:** `readdir data/`, filter `conversation-*/conversation.ndjson` files with `mtime` within the last 4 hours — schedule them immediately to recover lost timers from any restart.

### Summary Run Steps

```
1. Read conversation.ndjson → parse all message lines (skip attachment content, use text only)
2. Call aiRouter.summarize() → FULL SUMMARY prompt → write data/summaries/YYYY-WXX.md row
3. Call aiRouter.summarize() → ONE-LINER prompt → upsert row in data/summaries/YYYY-WXX.md
4. Call aiRouter.summarize() → MONTHLY prompt → regenerate data/summaries/YYYY-MM.md
5. If conversation has a projectId:
   → Call aiRouter.summarize() → PROJECT SUMMARY prompt
   → Regenerate data/project-{projectId}/summary.md
6. Call memoryService.update(conversationId) → merge new facts into user-memory.md
```

All file writes use atomic write (`.tmp` → `fs.rename`) to prevent corruption.

### AI Summary Prompts

#### One-liner (weekly log)
```
Summarize this conversation in a single sentence focused on what the user
was trying to accomplish or figure out. Start with a verb. Be specific.
Examples: "Debugged a CORS issue in an Express app."
          "Analyzed a PDF report on Q1 sales performance."
Do not describe the conversation itself. Describe the goal.
```

#### Full summary (conversation file)
```
Summarize this conversation in 2-4 sentences covering:
1. What the user was trying to accomplish (the goal)
2. The approach or direction taken
3. The outcome or resolution, if any
Be specific. Avoid vague language like "the user discussed X."
Note any files or images that were analyzed if relevant to the goal.
```

#### Topics list (conversation file)
```
List 3-6 specific topics or technologies from this conversation as short
noun phrases. Focus on concrete subjects, not meta-descriptions.
Return as a comma-separated list only, nothing else.
```

#### Monthly overview
```
Given these weekly one-line conversation summaries, write a 3-4 sentence
overview of this month's AI usage focused on:
- Recurring goals or problems
- What the user seems to be building or learning
- Any notable shifts in focus
Write in second person ("You spent..."). Do not list individual conversations.
```

### Markdown File Formats

**`data/summaries/YYYY-WXX.md`**
```markdown
# Week XX — Mon DD – Sun DD, YYYY

| Date | Conversation | Summary |
|------|-------------|---------|
| Apr 20 | {title} | {one-liner} |
```

**`data/summaries/YYYY-MM.md`**
```markdown
# {Month} YYYY

## Overview
{3-4 sentence AI-generated monthly overview}

## Conversations ({count} total)
- {title} — {one-liner}
```

---

## 11. Scheduler & Email

**File:** `server/src/jobs/weeklyDigest.ts`

### Cron Schedule
```typescript
// Sunday at 11:59pm — server must be in America/New_York timezone
cron.schedule('59 23 * * 0', sendWeeklyDigest);
```

### Digest Job Steps
```
1. Flush any pending unsummarized conversations immediately
2. Read data/summaries/YYYY-WXX.md (current week)
3. Read data/summaries/YYYY-MM.md (current month)
4. Read all data/project-{id}/summary.md files (one per project)
5. Call aiRouter.summarize() with digest prompt
6. Render HTML email
7. Send via Resend to EMAIL_TO
```

### Digest AI Prompt
```
Given these AI conversation summaries for the week and month, and the
current state of my projects, provide:
1. Recurring themes or questions this week
2. Patterns in how I use AI
3. Topics I seem to be exploring or learning
4. Progress made on active projects this week
5. 3-5 concrete new project ideas inspired by this week's conversations
Be specific. Reference actual topics and project names from the summaries.
```

### Email Template Sections
1. **Week at a Glance** — conversation count, models used, message count, files uploaded (uploads + AI-created downloads), active projects
2. **Weekly Summary** — rendered from weekly markdown
3. **Projects** — one block per project with its current AI-generated summary and any conversations added this week
4. **Monthly Themes** — rendered from monthly markdown overview
5. **AI Insights** — trends and patterns (AI-generated)
6. **New Project Ideas** — 3-5 ideas (AI-generated)
7. **Footer** — "Generated by shoyu-chat at holop.dev/chat · {date}"

**Provider:** `resend` npm package. Sender: `noreply@holop.dev`.

---

## 12. Auth System

- Single user — no registration flow
- Credentials stored in `data/user.json`, written once by seed script
- Password hashed with `bcrypt` (cost factor 12)
- JWT expiry: 7 days, stored in `httpOnly` + `Secure` + `SameSite=Strict` cookie
- All `/api/*` routes except `/api/auth/login` require `authMiddleware`

### Seed Script
```bash
npx ts-node scripts/seed.ts --username admin --email you@example.com
# Prompts for password interactively
# Writes data/user.json
```

### Auth Middleware
```typescript
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

## 13. Frontend (React PWA)

### PWA Config
- `vite-plugin-pwa` handles service worker generation
- `manifest.json`: `start_url: "/chat"`, `display: "standalone"`, 192px + 512px icons
- `vite.config.ts`: `base: '/chat/'`
- `App.tsx`: `<BrowserRouter basename="/chat">`
- Requires HTTPS (handled by Nginx in `holop-web`)

### Responsive Layout

The app is designed for both mobile and desktop — not just mobile-tolerant on desktop.

**Mobile (< 768px):**
- Sidebar is a full-screen drawer, toggled by hamburger
- Input fixed to bottom of viewport, rises with keyboard
- Tap to open/close sidebar

**Desktop (≥ 768px):**
- Sidebar is a persistent left panel (~260px wide)
- Chat area fills remaining width
- Input is fixed to bottom of the chat column, not the full viewport
- Drag-and-drop file upload supported (in addition to file picker)
- Keyboard shortcuts: `Cmd/Ctrl + K` new chat, `Escape` close sidebar

### Screens

#### Login
- Username + password form
- Centered card on desktop, full-screen on mobile
- On success: JWT cookie set by server, redirect to app shell
- No registration UI

#### App Shell
- Fixed top bar: "shoyu-chat", hamburger (mobile only), new chat button
- Persistent left sidebar on desktop, drawer on mobile: conversation list grouped by project
- Main area: active chat view
- Bottom-fixed input bar with attach button

#### Chat View
- Scrollable message list (newest at bottom)
- Each message: role indicator, markdown-rendered content, timestamp, model badge
- Attachment chips below user messages that include uploads:
  - Image chip: thumbnail preview + filename
  - Doc/code chip: file type icon + filename + size
  - Tap/click chip to download or view file
- Download links below assistant messages that triggered `WRITE_FILE` (see `MessageBubble` below)
- SSE streaming: text appears token-by-token
- Loading spinner while awaiting first token
- "All APIs quota exhausted" error state with retry-tomorrow message
- Desktop: drag files directly onto the chat area to attach
- `role: "internal"` messages filtered out — users never see raw search results

#### MessageBubble — AI-Created File Downloads

Assistant messages with a `downloads` array render download links below the message text:

```
[AI response text here...]

📄 script.py — Data processing script         v2 (updated)  ↓ Download
📄 requirements.txt — Python dependencies      v1            ↓ Download
```

- Files with `updated: true` show a version badge (e.g. "v2 (updated)") to indicate a revision, not a new file
- New files show "v1" or no badge
- Each download link calls `GET /api/conversations/:id/downloads/:fileId`
- Styled distinctly from upload chips — different color/icon signals "AI created this"

#### File Attachment Flow (Uploads)
```
1. User taps attach button (paperclip) or drags file onto chat (desktop)
2. Native file picker opens on mobile; drag-and-drop supported on desktop
3. File uploads immediately to POST /api/files/upload
4. On success: attachment chip appears above the text input
5. Multiple files can be attached before sending
6. User types message (optional) and sends
7. POST /api/chat/send includes { content, attachmentIds: [...] }
8. Chips move into the sent message bubble area
```

#### Conversation List (Sidebar)
- Grouped by project (collapsible), ungrouped conversations below
- Title from `meta.json`
- Sorted by `conversation.ndjson` mtime (most recent first)
- Shows file attachment indicator if conversation has uploads
- Shows download indicator if conversation has AI-created files
- Mobile: tap to switch, swipe/long-press to delete
- Desktop: click to switch, hover reveals delete button
- "New Chat" always visible at top

### New Hook: `useFileDownload`

```typescript
function useFileDownload() {
  const download = (conversationId: string, fileId: string, filename: string) => {
    const url = `/api/conversations/${conversationId}/downloads/${fileId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };
  return { download };
}
```

### API Client
All fetch calls go to `/api/*` (same origin). JWT cookie sent automatically. TanStack Query handles caching and refetching.

### Testing
- Vitest + React Testing Library
- Tests cover: render output, user interactions, hook behavior, API client calls
- Mocks: `msw` (Mock Service Worker) for API responses in component tests

---

## 14. Migration Script

**File:** `scripts/migrate-data-structure.ts`

A one-time migration from the old flat structure to the new directory structure. Idempotent — safe to run multiple times without duplicating or corrupting data.

### Old Structure (pre-migration)
```
data/
├── conversations/
│   ├── {id}.ndjson
│   ├── {id}.json
│   └── {id}/
│       └── {fileId}-{filename}   ← uploads only
├── projects/
│   ├── {id}.json
│   ├── {id}-context.md
│   └── {id}-summary.md
└── chats/
    └── YYYY-MM-DD-{id}.md
```

### Migration Steps

```
1. Read all files in data/conversations/
2. For each {id}.ndjson found:
   a. Create directory data/conversation-{id}/
   b. Copy {id}.ndjson → conversation-{id}/conversation.ndjson
   c. Copy {id}.json  → conversation-{id}/meta.json
      (rename "id" field value to "conversation-{id}" format if bare UUID)
   d. If data/conversations/{id}/ directory exists:
      - Create conversation-{id}/uploads/
      - Move all files from conversations/{id}/ → conversation-{id}/uploads/
   e. Create empty conversation-{id}/downloads/ and downloads/.versions/

3. Read all files in data/projects/
4. For each {id}.json found:
   a. Create directory data/project-{id}/
   b. Copy {id}.json        → project-{id}/meta.json
   c. Copy {id}-context.md  → project-{id}/context.md  (if exists)
   d. Copy {id}-summary.md  → project-{id}/summary.md  (if exists)

5. Migrate data/chats/ markdown files:
   - Move to data/summaries/archive/ rather than delete
   - Log count of archived files

6. Print migration report:
   - N conversations migrated
   - N projects migrated
   - N files moved to uploads/
   - N chat markdown files archived
   - Any errors encountered (do not abort on single-file errors)

7. Do NOT delete old structure automatically — print instructions
   for manual cleanup after the operator verifies the migration.
```

### Running the Migration

```bash
# Dry run first — prints what would happen, changes nothing
npx ts-node scripts/migrate-data-structure.ts --dry-run

# Real run
npx ts-node scripts/migrate-data-structure.ts

# Verify new structure is complete
npx ts-node scripts/migrate-data-structure.ts --verify
```

`--verify` mode reads the new structure and checks every `conversation-{id}/` has `meta.json`, `conversation.ndjson`, `uploads/`, `downloads/`, and `downloads/.versions/`. Reports any missing pieces.

### Migration Tests

**File:** `scripts/migrate-data-structure.test.ts`

- Set up a mock `DATA_DIR` with old-structure files
- Run migration against it; assert new directory structure is correct
- Assert no data loss (file contents match originals)
- Assert idempotency (run twice, same result)
- Assert `--dry-run` makes zero filesystem changes
- Assert `--verify` correctly identifies missing pieces
- Handle missing optional files gracefully (no context.md, no summary.md)
- Report errors per-conversation without aborting entire migration

---

## 15. Deployment

### Testing
- Vitest for all server-side tests
- Tests cover: route handlers (supertest), service logic, file operations, cron job behavior
- AI provider calls are mocked — tests never make real API calls
- Run tests: `npm test` (watch mode: `npm run test:watch`)

### Build & Deploy
```bash
cd server && npm run build
cd ../client && npm run build
cp -r client/dist /var/www/shoyu-chat/dist
pm2 restart shoyu-chat
```

### Data Directories (first deploy only)
```bash
mkdir -p $DATA_DIR/summaries
mkdir -p $DATA_DIR/summaries/archive
mkdir -p $DATA_DIR/backups

# Seed user credentials
npx ts-node scripts/seed.ts --username admin --email you@example.com

# Seed user memory
npx ts-node scripts/seed-memory.ts

# If migrating from old structure:
npx ts-node scripts/migrate-data-structure.ts --dry-run
npx ts-node scripts/migrate-data-structure.ts
npx ts-node scripts/migrate-data-structure.ts --verify
```

### Daily Backup Cron (2am)
```bash
# scripts/backup.sh
tar -czf $DATA_DIR/backups/data-$(date +%Y%m%d).tar.gz \
  $DATA_DIR/user.json \
  $DATA_DIR/usage.json \
  $DATA_DIR/summaries/ \
  $(find $DATA_DIR -maxdepth 1 -name 'conversation-*' -type d) \
  $(find $DATA_DIR -maxdepth 1 -name 'project-*'      -type d)
find $DATA_DIR/backups/ -mtime +30 -delete
# Optional: rclone sync to Cloudflare R2
rclone sync $DATA_DIR r2:holop-data --exclude "backups/**"
```

Add to crontab: `0 2 * * * /home/user/shoyu-chat/scripts/backup.sh`

---

*Last updated: 2026-05-03*
*Status: Active development*
