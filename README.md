# shoyu-chat

Single-user PWA chat application served at `holop.dev/chat`.

---

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Zustand + TanStack Query
- **Backend**: Node.js + Express 5 + TypeScript
- **Storage**: Filesystem (no database) — `$DATA_DIR`
- **Auth**: JWT in `httpOnly` cookie + bcrypt
- **AI Providers**: Groq, Gemini, NVIDIA, OpenRouter (free tiers)
- **Email**: Resend
- **Scheduler**: node-cron
- **Process manager**: PM2 (port 3001)

## Request Flow

```
Browser → Nginx (holop-web) → :3001 (shoyu-chat server)
                              ├── /api/*  → Express routes
                              └── /chat/* → static React build
```

---

## Key Design Decisions

- **No database**: Single-user app; filesystem is simpler and portable.
- **NDJSON for messages**: Append-only format avoids read-modify-write races.
- **Atomic writes**: All JSON/markdown writes go through `.tmp` → `rename` to prevent corruption.
- **SSE for streaming**: Server-sent events pipe AI tokens to the browser as they arrive.
- **Intent-based provider routing**: The user selects an intent (Coding, Debugging, Web Search, etc.) and the AI router picks the best provider/model tier for that intent, falling back down the tier list on failure or quota exhaustion.
- **WRITE_FILE tool**: All providers are given a `write_file` function tool. When the AI calls it, the server writes the file to `conversation-{id}/downloads/`, versions previous copies in `.versions/` (last 3 kept), and delivers a `DownloadEntry` in the SSE `done` event.
- **User memory**: A persistent `data/user-memory.md` profile is injected as a system prompt into every chat request. Updated after each summarization run using NVIDIA Llama 3.1 405B (fallback: Gemini).
- **Projects**: Conversations can be grouped into projects. Each project has a free-form context document and an AI-generated summary synthesized from its conversations.
- **Global search**: Full-text search across conversations, projects, uploads, downloads, and summaries. Indexed at `data/search-index.jsonl`. Auto-seeded on boot.
- **Inactivity summaries**: 4-hour debounce timer after each AI response triggers an AI-generated markdown summary.
- **Theme**: Dark/light mode switches automatically at 6 AM and 6 PM local time.

---

## Data Directory Layout

```
data/
├── user.json
├── usage.json
├── user-memory.md                        (gitignored)
├── search-index.jsonl                    ← full-text search index (append-only NDJSON)
│
├── conversation-{id}/
│   ├── meta.json                         ← ConversationMeta (title, projectId, created_at)
│   ├── conversation.ndjson               ← one StoredMessage per line (append-only)
│   ├── uploads/
│   │   └── {fileId}-{filename}           ← user-uploaded files
│   └── downloads/
│       ├── {fileId}-{filename}           ← AI-generated files (WRITE_FILE tool)
│       └── .versions/
│           └── {fileId}-v{n}-{filename}  ← previous versions (last 3 kept)
│
├── project-{id}/
│   ├── meta.json                         ← ProjectMeta (id, name, description, created_at)
│   ├── context.md                        ← free-form context document (injected into chat)
│   └── summary.md                        ← AI-generated project summary
│
├── chats/
│   └── YYYY-MM-DD-{uuid}.md             ← AI-generated chat summary
│
└── summaries/
    ├── YYYY-WXX.md                       ← weekly one-liner table
    └── YYYY-MM.md                        ← monthly overview
```

---

## AI Router

`server/src/services/aiRouter.ts`

### Intent Fallback Matrix

Rather than a single global priority list, the router selects providers based on the **intent** of each message. The user picks an intent from the UI (or the client auto-detects one via `detectIntent()`); the server walks the corresponding tier list until a provider succeeds.

| Intent | T1 | T2 | T3 |
|---|---|---|---|
| `WEB_SEARCH` | Gemini 2.5 Flash (search) | Gemini 2.5 Pro (search) | OR: GPT-oss-120b |
| `CODING` | NVIDIA: Llama 3.3 70B | Groq: Llama 3.3 70B | Gemini 2.5 Pro |
| `DEBUGGING` | Groq: Llama 3.3 70B | Gemini 2.5 Flash | OR: Laguna M.1 |
| `TRANSLATING` | OR: GPT-oss-120b | Gemini 2.5 Pro | Groq: Llama 3.3 70B |
| `DRAFTING` | Groq: Llama 3.3 70B | Gemini 2.5 Flash | NVIDIA: Llama 3.1 70B |
| `SUMMARIZING` | Gemini 2.5 Flash | Groq: Llama 3.3 70B | OR: Llama 3.2 3B |
| `IMAGE_ANALYSIS` | Gemini 2.5 Flash (vision) | Gemini 2.5 Pro (vision) | OR: GPT-oss-120b (vision) |

A tier is skipped if its provider API key is missing or its daily quota is exhausted. The label in the response includes `(Fallback)` for any tier beyond T1.

### Providers & Daily Limits

| Key | Env var | Default |
|---|---|---|
| `groq-chat` | `GROQ_CHAT_DAILY_LIMIT` | 1,000 |
| `gemini` | `GEMINI_DAILY_LIMIT` | 1,500 |
| `openrouter` | `OPENROUTER_DAILY_LIMIT` | 200 |
| `nvidia` | `NVIDIA_DAILY_LIMIT` | 1,000 |

Usage is incremented only on the first token received. If a provider returns HTTP 402 or 403, its daily counter is auto-exhausted so subsequent requests skip it immediately.

### Summarization

`summarize()` routes nvidia → gemini → groq-chat → openrouter, independent of the chat intent fallback matrix.

### User Memory Injection

By default, the router prepends a `system` message containing `data/user-memory.md` before routing every request (`injectMemory=true`).

---

## File Uploads

### Upload Flow

1. User taps the paperclip button or drags a file
2. `POST /api/files/upload` — multipart/form-data with `file` + `conversationId`
3. multer writes to `conversation-{conversationId}/uploads/{fileId}-{filename}`
4. Server returns `{ fileId, filename, mimeType, size }`
5. Client stores the `Attachment` object and shows an `AttachmentChip`
6. On send, `POST /api/chat/send` includes `attachments: [{ fileId, filename, mimeType, size }]`
7. Server extracts file context and injects it into the AI prompt

### Context Extraction (`fileService.ts`)

| Type | Processing |
|---|---|
| `image/*` | Read as base64; passed as `inlineData` to Gemini |
| `application/pdf` | `pdf-parse` extracts text; injected as fenced block |
| `text/*`, `application/json` | Read as UTF-8; injected as fenced code block with language hint |
| Other | Attempt UTF-8 read; on failure show placeholder message |

Text content is truncated at 50,000 characters with a notice.

### File Lifecycle

- Uploaded files live in `conversation-{id}/uploads/` for the lifetime of the conversation.
- Deleting a conversation removes the entire `conversation-{id}/` directory.
- Files are not shared between conversations.
- `DELETE /api/files/:conversationId/:fileId` removes a single file without modifying the message history.

### Allowed Types & Size

Controlled by `ALLOWED_FILE_TYPES` and `MAX_FILE_SIZE_MB` env vars. Defaults: images (JPEG, PNG, GIF, WebP), PDF, common text/code formats; 20 MB.

---

## Summary System

### Inactivity Debounce

After every AI response, `summaryService.schedule(conversationId)` resets a 4-hour timer. On server boot, `recoverSummaryTimers()` reschedules timers for conversations whose `conversation.ndjson` mtime is within the last 4 hours.

### Summary Run Steps

1. Read all messages from `conversation-{id}/conversation.ndjson`
2. Generate a **full summary** (2–4 sentences) → write `data/chats/YYYY-MM-DD-{id}.md`
3. Generate a **topics list** (3–6 noun phrases) → included in the chat file
4. Generate a **one-liner** → upsert a row in `data/summaries/YYYY-WXX.md`
5. Regenerate the **monthly overview** → rewrite `data/summaries/YYYY-MM.md`

Summarization uses `aiRouter.summarize()` (nvidia → gemini → groq-chat → openrouter).

---

## Weekly Digest

**Schedule**: `59 23 * * 0` — Sunday at 11:59 PM in the `TZ` timezone (default `America/New_York`).

### Job Steps

1. `flushAllPending()` — run any outstanding inactivity-debounce summaries immediately
2. Read `data/summaries/YYYY-WXX.md` and `data/summaries/YYYY-MM.md`
3. Call `aiRouter.summarize()` to generate AI insights
4. Render and send the HTML email via Resend

### Email Sections

1. **This Week** — rendered weekly markdown table
2. **Monthly Themes** — rendered monthly overview
3. **AI Insights & Ideas** — AI-generated trends + 3–5 project ideas

`POST /api/admin/digest/trigger` (auth-protected) runs the job immediately for testing.

---

## Server

### Routes

| File | Purpose |
|---|---|
| `auth.ts` | Login, logout, /me — sets/clears the JWT cookie |
| `chat.ts` | `POST /send` — SSE streaming chat with optional file attachments |
| `conversations.ts` | CRUD for conversations; download endpoints for AI-written files |
| `files.ts` | File upload (`POST /upload`), retrieval, and deletion |
| `projects.ts` | CRUD for projects; context document; project-level downloads list |
| `search.ts` | Full-text search query and index rebuild |

All routes except auth are protected by the `requireAuth` middleware.

#### Conversations

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/conversations` | List all conversations |
| `GET` | `/api/conversations/:id` | Get conversation with messages |
| `POST` | `/api/conversations` | Create conversation (optional `projectId`) |
| `PATCH` | `/api/conversations/:id` | Rename conversation |
| `DELETE` | `/api/conversations/:id` | Delete conversation and all its files |
| `POST` | `/api/conversations/:id/assign` | Assign or unassign a project |
| `GET` | `/api/conversations/:id/downloads` | List AI-written downloads |
| `GET` | `/api/conversations/:id/downloads/:fileId` | Stream a specific download file |

#### Projects

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/projects` | List all projects with conversation counts |
| `POST` | `/api/projects` | Create project (`name`, `description`) |
| `GET` | `/api/projects/:id` | Get project meta, contextDoc, summary, and conversations |
| `PATCH` | `/api/projects/:id` | Update name/description |
| `DELETE` | `/api/projects/:id` | Unassign all conversations then delete project directory |
| `GET` | `/api/projects/:id/context` | Return raw context document |
| `PUT` | `/api/projects/:id/context` | Overwrite context document |
| `GET` | `/api/projects/:id/downloads` | List all downloads across the project's conversations |

#### Search

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/search?q=...` | Search; supports `projectId`, `types`, `limit` query params |
| `POST` | `/api/search/rebuild` | Rebuild the full index from disk |

The index is auto-seeded on startup if `data/search-index.jsonl` is missing. Manual rebuild: `npm run search:reindex`.

### Services

| File | Purpose |
|---|---|
| `aiRouter.ts` | Intent-based fallback matrix; `WRITE_FILE_TOOL` definition used by all providers |
| `groqService.ts` | Groq API — `streamChatGroqChat`, `streamChatGroqChatWithTools`, `summarizeGroq` |
| `geminiService.ts` | Google Gemini API — text, vision, web-search grounding, tool calls |
| `nvidiaService.ts` | NVIDIA NIM API — `streamChatNvidia`, `streamChatNvidiaWithTools`, `summarizeNvidia` |
| `openrouterService.ts` | OpenRouter free-tier — `streamChatOpenRouter`, `streamChatOpenRouterWithTools`, `summarizeOpenRouter` |
| `fileService.ts` | Upload context extraction; `writeDownload` / `getConversationDownloads` / `getProjectDownloads` |
| `summaryService.ts` | 4-hour inactivity debounce → AI summarization |
| `markdownService.ts` | Read/write `chats/` and `summaries/` files; indexes each write |
| `emailService.ts` | Weekly digest HTML email via Resend |
| `memoryService.ts` | Read/write `data/user-memory.md`; `updateMemoryFromConversation` merges new facts |
| `projectService.ts` | `regenerateProjectSummary` — AI summary synthesized from all conversations in a project |
| `searchExtractor.ts` | Converts messages, projects, files, and summaries into `SearchRecord[]` |
| `searchIndexService.ts` | Append-only NDJSON index at `data/search-index.jsonl`; serialized write queue |
| `searchService.ts` | Full-text search — phrase/multi-term matching, fuzzy fallback, recency + project-relevance scoring |

### Middleware

| File | Purpose |
|---|---|
| `authMiddleware.ts` | Validates JWT `token` cookie; attaches `{ userId, username }` to `req.user` or returns 401 |
| `uploadMiddleware.ts` | multer disk-storage for `POST /api/files/upload`; validates MIME type and size before writing |
| `errorHandler.ts` | Global Express error handler — logs and returns 500 JSON |

### Jobs

| File | Purpose |
|---|---|
| `weeklyDigest.ts` | `node-cron` task — Sunday 11:59 PM; flushes summaries, generates AI insights, sends email |

### Storage

Filesystem-only persistence. No database.

| Export | Purpose |
|---|---|
| `readUser / writeUser` | `data/user.json` |
| `getUsageCount / incrementUsage / setUsageCount` | `data/usage.json` — per-provider per-day counters |
| `listProjects` | Scans `data/` for `project-*/` dirs |
| `getProjectMeta` | Reads `project-{id}/meta.json` |
| `createProject` | Creates `project-{id}/` with `meta.json`, `context.md`, `summary.md` |
| `updateProject / deleteProject` | Rewrite meta atomically / remove entire directory |
| `getProjectContext / writeProjectContext` | `project-{id}/context.md` |
| `getProjectSummary / writeProjectSummary` | `project-{id}/summary.md` |
| `listConversations` | Scans `data/` for `conversation-*/` dirs |
| `getConversationMeta` | Reads `conversation-{id}/meta.json` |
| `createConversation` | Creates `conversation-{id}/` with `meta.json`, `conversation.ndjson`, `uploads/`, `downloads/` |
| `updateConversationTitle / assignConversationProject` | Rewrite `conversation-{id}/meta.json` atomically |
| `deleteConversation` | Removes entire `conversation-{id}/` directory |
| `getMessages / appendMessage` | Read/append `conversation-{id}/conversation.ndjson` |
| `conversationFilesDir` | Returns `conversation-{id}/uploads/` path |
| `conversationDownloadsDir` | Returns `conversation-{id}/downloads/` path |
| `listConversationsByProject` | Filtered `listConversations` for a given `projectId` |
| `getRecentlyActiveConversations` | IDs whose `conversation.ndjson` mtime is within a given window |

### Utils

| File | Export | Purpose |
|---|---|---|
| `dateHelpers.ts` | `getISOWeekKey()` | Returns `YYYY-WXX` (e.g. `2026-W18`) |
| | `getMonthKey()` | Returns `YYYY-MM` |
| | `getWeekRangeLabel()` | Returns `"Apr 27 – May 3"` |
| | `getMonthLabel(date)` | Returns `"May 2026"` |
| `logger.ts` | `logger.info/warn/error/debug` | Console wrapper with ISO timestamps; `debug` is a no-op in production |

---

## Client

### API (`client/src/api/`)

Thin fetch wrappers. All use `credentials: 'include'` for the JWT cookie.

| File | Exports |
|---|---|
| `auth.ts` | `login`, `logout`, `getMe` |
| `chat.ts` | `sendMessage` — SSE `AsyncGenerator<SSEEvent>` |
| `conversations.ts` | `listConversations`, `getConversation`, `createConversation`, `deleteConversation`, `updateConversationTitle` |
| `files.ts` | `uploadFile`, `deleteFile`, `getFileUrl` |
| `projects.ts` | `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`, `getProjectContext`, `updateProjectContext`, `assignConversation` |
| `search.ts` | `search(q, options)`, `rebuildSearchIndex()` |

#### SSE Events

```ts
{ type: 'token'; content: string }
{ type: 'done'; model: string; conversationId: string; intent: Intent; downloads?: MessageDownload[] }
{ type: 'error'; message: string }
```

When the AI used the `write_file` tool, `done` includes a `downloads` array so the client can show download chips immediately.

### Components (`client/src/components/`)

#### auth/
| File | Purpose |
|---|---|
| `LoginScreen.tsx` | Username/password form; delegates to `useAuth` |

#### chat/
| File | Purpose |
|---|---|
| `AttachmentChip.tsx` | Pill with filename/thumbnail; optional remove; wraps in `<a>` when `conversationId` is provided |
| `ChatView.tsx` | Main chat pane; message list + streaming bubble + `MessageInput` |
| `MessageBubble.tsx` | Single message; renders markdown; shows upload chips and AI download chips |
| `MessageInput.tsx` | Textarea + send + paperclip; drag-and-drop; pending attachment chips |
| `ModelBadge.tsx` | Colored badge showing the AI provider used |

#### layout/
| File | Purpose |
|---|---|
| `AppShell.tsx` | Root layout — sidebar + topbar + chat pane; mobile/desktop sidebar state |
| `Sidebar.tsx` | Conversation list; `ProjectList` above unassigned conversations |
| `TopBar.tsx` | Header with hamburger, title, search trigger, new-chat, sign-out |

#### projects/
| File | Purpose |
|---|---|
| `ProjectList.tsx` | Collapsible sidebar tree of projects; inline "new chat" per project |
| `ProjectDetail.tsx` | Project view — name, description, context editor, summary, conversations, downloads |
| `ContextEditor.tsx` | Textarea for editing a project's context document with save/cancel |

#### search/
| File | Purpose |
|---|---|
| `SearchPalette.tsx` | Modal command-palette; debounced input, filterable by result type |
| `SearchResultItem.tsx` | Single result row with type icon, title, snippet, navigation target |

### Hooks (`client/src/hooks/`)

| File | Purpose |
|---|---|
| `useAuth.ts` | TanStack Query wrapper for `/api/auth/me`; `login`, `logout`, `user` |
| `useChat.ts` | Fetches messages; `send()` drives the SSE stream and updates the chat store |
| `useConversations.ts` | List, create, delete, rename via TanStack Query mutations |
| `useFileUpload.ts` | Pending attachment state; `upload(files)`, `remove(fileId)`, `clear()` |
| `useFileDownload.ts` | `download(conversationId, fileId, filename)` — browser download via `/api/conversations/:id/downloads/:fileId` |
| `useProjects.ts` | `useProjects()` and `useProject(id)` — TanStack Query wrappers with create/update/delete/assign mutations |
| `useSearch.ts` | Debounced search (300 ms); `query`, `setQuery`, `results`, `isLoading` |
| `useTheme.ts` | Auto dark/light at 6 AM / 6 PM; rechecks every minute |

### Store (`client/src/store/`)

| File | Purpose |
|---|---|
| `authStore.ts` | `{ user, setUser }` — cached auth user populated by `useAuth` on mount |
| `chatStore.ts` | Streaming state and active conversation for real-time token rendering |

`chatStore` actions: `setActiveConversation`, `appendToken`, `finalizeStream`, `setStreamError`, `resetStream`.

### Types (`client/src/types/index.ts`)

| Type | Description |
|---|---|
| `User` | `{ userId, username, email? }` |
| `Attachment` | `{ fileId, filename, mimeType, size? }` — user upload reference |
| `MessageDownload` | `{ fileId, filename, description?, version, updated?, size?, created_at? }` — AI-written file |
| `Message` | Chat message with optional `attachments`, `downloads`, `model_used`, `intent` |
| `Conversation` | Metadata with `projectId`, `model_last_used`, `has_files` |
| `ConversationWithMessages` | `Conversation & { messages: Message[] }` |
| `Project` | `{ id, name, description, created_at, conversationCount }` |
| `ProjectDetail` | Project + `contextDoc`, `summary`, `conversations[]` |
| `ProjectDownloadEntry` | `MessageDownload & { conversationId, conversationTitle }` |
| `Intent` | Enum: `WEB_SEARCH` `CODING` `DEBUGGING` `TRANSLATING` `DRAFTING` `SUMMARIZING` `IMAGE_ANALYSIS` |
| `INTENT_CONFIG` | `Record<Intent, { label, icon, description }>` |
| `INTENT_MODEL_LABELS` | Maps raw provider/model strings to human-readable badge labels |
| `SSEEvent` | `token` \| `done` (with `intent` + optional `downloads[]`) \| `error` |

### Utils (`client/src/utils/`)

`detectIntent(content, hasImages): Intent` — heuristic intent detection, runs synchronously in the browser. Checks patterns in order: IMAGE_ANALYSIS → WEB_SEARCH → TRANSLATING → SUMMARIZING → DRAFTING → DEBUGGING → CODING. Falls back to CODING.
