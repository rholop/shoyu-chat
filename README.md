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
- **Insights system**: A passive, zero-extra-LLM-call pipeline that accumulates topic and pattern data from summaries and surfaces personal insights in the weekly email and as in-app nudges. See [Insights System](#insights-system) below.
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
├── insights/
│   └── topic-ledger.jsonl               ← append-only record of every summarized conversation
│
├── conversation-{id}/
│   ├── meta.json                         ← ConversationMeta (title, projectId, created_at, resolved, summarizedAt)
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
2. Generate a **full summary** (2–4 sentences) + parse `RESOLVED: yes/no` line → write `data/chats/YYYY-MM-DD-{id}.md`, update `resolved` + `summarizedAt` in `meta.json` (atomic write)
3. Generate a **topics list** (3–6 noun phrases) → included in the chat file
4. Generate a **one-liner** → upsert a row in `data/summaries/YYYY-WXX.md`
5. Regenerate the **monthly overview** → rewrite `data/summaries/YYYY-MM.md`
6. Update **user memory** → `data/user-memory.md`
7. Regenerate **project summary** → `data/project-{id}/summary.md` (if conversation is linked to a project)
8. Append a **ledger entry** → `data/insights/topic-ledger.jsonl` via `ledgerService.append()`
9. Extract **todos** → `todoService.extractAndSave(conversationId)` — errors are caught and do not interrupt the run

Summarization uses `aiRouter.summarize()` (nvidia → gemini → groq-chat → openrouter).

---

## Insights System

A passive pipeline that accumulates structured data from every summarization run and surfaces personal insights in the weekly digest and as in-app nudges. Costs **1 additional AI call per week** beyond the existing digest.

### Topic Ledger (`data/insights/topic-ledger.jsonl`)

Append-only NDJSON. One entry written per summarized conversation by `ledgerService.append()` at the end of every summary run. Never rewritten — only appended. Parsed in memory when needed.

| Field | Type | Source |
|---|---|---|
| `date` | `string` | `meta.json` → `created_at` (YYYY-MM-DD) |
| `conversationId` | `string` | `conversation-{id}` |
| `topics` | `string[]` | Parsed from `## Topics` section of the chat markdown |
| `goal` | `string` | First sentence of `## Summary` section |
| `intent` | `string` | Most common intent found in internal messages |
| `projectId` | `string\|null` | `project-{id}` or null |
| `projectName` | `string\|null` | From `project-{id}/meta.json` |
| `model` | `string` | Most common model label across non-internal messages |
| `messageCount` | `number` | Count of non-internal messages |
| `resolved` | `boolean\|null` | Populated from the RESOLVED line in the summary |

`ledgerService` exports: `append(conversationId)`, `readAll()`, `readSince(date)`, `getTopicFrequency(entries)`, `getByProject(entries, projectId)`.

### Resolution Detection

The full summary prompt includes a `RESOLVED: yes/no` instruction. `summaryService` parses this from the AI response and writes `resolved: boolean` and `summarizedAt` to `conversation-{id}/meta.json`. Unresolved conversations show a subtle dot indicator in the sidebar.

### Pattern Report (`insightsService.buildPatternReport()`)

Computed every Sunday before the digest. Pure data aggregation — no AI call. Produces:
- All-time and last-4-weeks topic frequency maps
- New vs returning topics this week
- Topics appearing across 3+ distinct weeks (persistent interests)
- Topics never tied to a project (orphan interests)
- Intent distribution percentages
- Weekly conversation counts for the last 4 weeks

### Proactive Nudges

On the first message of a new conversation, `POST /api/insights/similar` runs a keyword intersection against the topic ledger. If a match scores above threshold, a dismissible `NudgeBanner` appears in the chat view linking to the related conversation. Prefers unresolved matches. Zero AI calls.

### Weekly Digest Integration

The Sunday digest job runs two concurrent AI calls:

**Call 1 (existing):** Weekly + monthly summaries + project summaries → narrative digest + project ideas.

**Call 2 (new):** Pattern report + unresolved thread list + rolling 8-week history → "About You This Week" section with four parts: what you're actually focused on, patterns worth naming, orphan interests, and suggested projects grounded in recent activity.

The email also includes a raw **Your Numbers** table (topic frequencies, intent split, conversation counts) rendered directly from the pattern report with no AI involvement.

### Open Loops (`insightsService.getUnresolvedThreads / snoozeLoop / resolveLoop`)

`getUnresolvedThreads()` returns all conversations where `resolved === false`, sorted by `created_at` descending. Conversations where `snoozedUntil >= today` (UTC date) are excluded. Each result is enriched with `daysSinceCreated` (computed at query time), and `goal`/`intent`/`topics` from the topic ledger.

`snoozeLoop(conversationId, snoozedUntil)` sets `snoozedUntil: YYYY-MM-DD` in `meta.json` via `atomicWrite`. Throws `'Conversation not found'` if the file is missing.

`resolveLoop(conversationId)` sets `resolved: true`, clears `snoozedUntil` to `null`, and writes `resolvedAt` (ISO timestamp) via `atomicWrite`. Throws `'Conversation not found'` if the file is missing.

### Project Suggestions (`projectSuggestionService`)

Detects "orphan" topics — recurring subjects the user keeps exploring without a dedicated project. A topic qualifies if it:

1. Appears in **≥ 5 distinct conversations**
2. Spans **≥ 2 calendar weeks**
3. Has **never** been linked to any `projectId`
4. Was last seen **within 30 days**

`getProjectSuggestions()` reads the topic ledger and returns up to 3 matching topics sorted by conversation count, excluding any previously dismissed. No AI call.

`generateProjectContext(suggestion)` is called only when a user accepts a suggestion. It produces a 150–300-word markdown starter context document via `aiRouter.summarize()`.

`dismissSuggestion(topic)` permanently ignores a topic. Dismissals are stored in `data/insights/dismissed-suggestions.json` (lowercase, atomic write).

---

## To-Do System

### Storage

Each conversation stores its todos at `data/conversation-{id}/todos.json` — a JSON array written atomically after each summarization run. An empty array `[]` is written if no actionable items are found.

### `todoService` — Key Functions

| Function | Description |
|---|---|
| `extractAndSave(conversationId)` | Calls AI with conversation history to extract 0–3 todos; writes `todos.json` atomically. Wrapped in try/catch — failures write `[]` to ensure the file exists. |
| `getTodos(conversationId)` | Reads and parses `todos.json`; returns `[]` on ENOENT or if content is not a JSON array. |
| `getAllTodos()` | Aggregates across all conversations; filters out `status: "done"`. |
| `getAllTodosWithStatus()` | Same as above but includes all statuses. Sorted by `createdAt` desc. |
| `updateTodo(convId, todoId, updates)` | Updates `status`, `priority`, `text`, `dueDate`, or `snoozedUntil`; sets `updatedAt`; writes atomically. Throws `'Todo not found'` if id is absent. |
| `deleteTodo(convId, todoId)` | Removes one todo; writes atomically. Throws `'Todo not found'` if id is absent. |
| `createTodoFromLoop(loop)` | Creates a todo from an open loop without calling the AI. Sets `text` to `loop.goal` (fallback: `"Follow up on: <title>"`), `priority` to `"soon"`. Appends to existing todos. |

### AI Prompt Behavior

`extractAndSave` routes through the `SUMMARIZING` intent path. The prompt instructs the model to return a raw JSON array (no markdown fences). `parseTodoResponse` strips fences defensively, validates each item, and enforces a maximum of 3 items and 120 characters per `text`.

### Todo Types

Defined in `server/src/types/index.ts`:

- `TodoPriority` — `"now" | "soon" | "someday"`
- `TodoStatus` — `"open" | "done" | "snoozed"`
- `Todo` — full record including `id`, `conversationId`, `projectId`, `projectName`, `intent`, `dueDate`, `snoozedUntil`, `sourceMessageHint`

### ICS Export (`icsService`)

Generates RFC 5545-compliant iCalendar files for todo export to Apple Calendar, Google Calendar, etc.

- Each todo becomes a `VEVENT` with `DTSTART;VALUE=DATE` (all-day event).
- `DTEND` is always `DTSTART + 1 day` as required by the spec.
- `SUMMARY` = escaped todo text; `DESCRIPTION` = source conversation title + `sourceMessageHint`.
- `escapeIcsText()` escapes `\`, `;`, `,`, and strips bare `\r` (which could inject iCal fields) before escaping `\n` to `\\n`.
- `generateIcs()` throws if passed an empty array.
- Line folding (RFC 5545 §3.1 — max 75 octets per line) is not implemented; long property values are written as-is.

---

## Todo Digest (`todoDigestService`)

`buildTodoDigestReport()` aggregates todo statistics for the weekly digest. No AI calls — pure data aggregation.

### Overdue Definition

A todo is **overdue** if its `status` is `"open"` and either:
1. It has a `dueDate` set and `dueDate < today` (strict), **or**
2. Its `priority` is `"now"` and it was created more than 7 days ago.

### `TodoDigestReport` Fields

| Field | Description |
|---|---|
| `createdThisWeek` | Todos with `createdAt` in the last 7 days; sorted newest first |
| `completedThisWeek` | Todos with `status: "done"` and `updatedAt` in the last 7 days; sorted newest first |
| `overdue` | Todos matching the overdue criteria; sorted oldest first |
| `totalOpen` | Count of all open todos across all conversations |
| `totalDone` | Count of all done todos (all time) |

Each item resolves `conversationTitle` from the conversation's `meta.json`.

---

## Weekly Digest

**Schedule**: `59 23 * * 0` — Sunday at 11:59 PM in the `TZ` timezone (default `America/New_York`).

### Job Steps

1. `flushAllPending()` — run any outstanding inactivity-debounce summaries immediately
2. Read `data/summaries/YYYY-WXX.md` and `data/summaries/YYYY-MM.md`
3. Read all `data/project-{id}/summary.md` files
4. `insightsService.buildPatternReport()` — compute pattern data from ledger
5. `insightsService.getUnresolvedThreads()` — list open loose threads
6. `insightsService.buildRollingHistory(8)` — 8-week conversation history
7. `todoDigestService.buildTodoDigestReport()` — todo stats (no AI call)
8. Run Call 1 (narrative digest) and Call 2 (personal insights) concurrently; both prompts include the todo digest data
9. Render and send the HTML email via Resend

### Email Sections

1. **This Week** — rendered weekly markdown table
2. **Loose Threads** — unresolved conversations list
3. **Monthly Themes** — rendered monthly overview
4. **Active Projects** — AI-generated project summaries
5. **AI Insights & Ideas** — narrative digest + 3–5 project ideas (Call 1)
6. **About You This Week** — personal insights: focus, patterns, orphan interests, suggested projects (Call 2)
7. **Your Numbers** — raw topic frequencies, intent split, weekly counts (no AI)

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
| `insights.ts` | `POST /api/insights/similar` — keyword similarity against topic ledger |

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

#### Insights

| Method | Path | Action |
|---|---|---|
| `POST` | `/api/insights/similar` | Keyword match against topic ledger; returns up to 2 related conversations |

The index is auto-seeded on startup if `data/search-index.jsonl` is missing. Manual rebuild: `npm run search:reindex`.

#### To-Dos

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/todos` | All open todos sorted by priority (now→soon→someday) then `createdAt` desc |
| `GET` | `/api/todos/export.ics` | All open todos as a single `.ics` calendar file |
| `GET` | `/api/todos/conversation/:id` | Todos for one conversation |
| `GET` | `/api/todos/:convId/:todoId/export.ics` | Single todo as `.ics` |
| `PATCH` | `/api/todos/:convId/:todoId` | Update `status`, `priority`, `text`, `dueDate`, `snoozedUntil` |
| `DELETE` | `/api/todos/:convId/:todoId` | Delete a todo |

Route params `convId` and `todoId` are validated against `[a-zA-Z0-9_-]+`. `status` must be `open|done|snoozed`; `priority` must be `now|soon|someday`; `dueDate`/`snoozedUntil` must be `YYYY-MM-DD` or `null`.

#### Open Loops

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/loops` | Unresolved conversations; filter by `projectId`, `intent`, `age` (min days) |
| `POST` | `/api/loops/:id/snooze` | Snooze loop until `snoozedUntil` (YYYY-MM-DD) |
| `POST` | `/api/loops/:id/resolve` | Mark conversation resolved |
| `POST` | `/api/loops/:id/todo` | Create a todo from the loop's goal |

#### Project Suggestions

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/suggestions/projects` | Up to 3 suggested projects from recurring orphan topics |
| `POST` | `/api/suggestions/projects/create` | Accept suggestion: create project + context doc + dismiss topic |
| `POST` | `/api/suggestions/projects/dismiss` | Dismiss a suggestion permanently |

`topic` body param is validated to ≤ 200 characters on both mutating routes.

### Services

| File | Purpose |
|---|---|
| `aiRouter.ts` | Intent-based fallback matrix; `WRITE_FILE_TOOL` definition used by all providers |
| `groqService.ts` | Groq API — `streamChatGroqChat`, `streamChatGroqChatWithTools`, `summarizeGroq` |
| `geminiService.ts` | Google Gemini API — text, vision, web-search grounding, tool calls |
| `nvidiaService.ts` | NVIDIA NIM API — `streamChatNvidia`, `streamChatNvidiaWithTools`, `summarizeNvidia` |
| `openrouterService.ts` | OpenRouter free-tier — `streamChatOpenRouter`, `streamChatOpenRouterWithTools`, `summarizeOpenRouter` |
| `fileService.ts` | Upload context extraction; `writeDownload` / `getConversationDownloads` / `getProjectDownloads` |
| `summaryService.ts` | 4-hour inactivity debounce → AI summarization; parses `RESOLVED` status; calls `ledgerService.append()` and `todoService.extractAndSave()` |
| `markdownService.ts` | Read/write `chats/` and `summaries/` files; indexes each write |
| `emailService.ts` | Weekly digest HTML email via Resend |
| `memoryService.ts` | Read/write `data/user-memory.md`; `updateMemoryFromConversation` merges new facts |
| `projectService.ts` | `regenerateProjectSummary` — AI summary synthesized from all conversations in a project |
| `ledgerService.ts` | Append-only `data/insights/topic-ledger.jsonl`; `readAll`, `readSince`, `getTopicFrequency`, `getByProject` |
| `insightsService.ts` | `buildPatternReport`, `getUnresolvedThreads`, `snoozeLoop`, `resolveLoop`, `buildRollingHistory`, `findSimilar` |
| `todoService.ts` | AI extraction of actionable todos from conversations; CRUD helpers; `createTodoFromLoop` |
| `icsService.ts` | RFC 5545 iCalendar generation for todos; `generateIcs`, `escapeIcsText` |
| `projectSuggestionService.ts` | Detects recurring orphan topics and surfaces up to 3 project suggestions; `dismissSuggestion` |
| `todoDigestService.ts` | Aggregates todo stats for weekly digest; `buildTodoDigestReport` |
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
| `weeklyDigest.ts` | `node-cron` task — Sunday 11:59 PM; flushes summaries, builds pattern report, runs two concurrent AI calls, sends email |

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
| | `getDateDaysAgo(n)` | Returns `YYYY-MM-DD` for `n` days before today |
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
| `insights.ts` | `findSimilar(message, conversationId)` |

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
| `ChatView.tsx` | Main chat pane; message list + streaming bubble + `MessageInput` + `NudgeBanner` |
| `MessageBubble.tsx` | Single message; renders markdown; shows upload chips and AI download chips |
| `MessageInput.tsx` | Textarea + send + paperclip; drag-and-drop; pending attachment chips |
| `ModelBadge.tsx` | Colored badge showing the AI provider used |
| `NudgeBanner.tsx` | Dismissible banner shown on first message if ledger finds a related prior conversation |

#### layout/
| File | Purpose |
|---|---|
| `AppShell.tsx` | Root layout — sidebar + topbar + chat pane; mobile/desktop sidebar state |
| `Sidebar.tsx` | Conversation list with unresolved indicators; `ProjectList` above unassigned conversations |
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
| `useChat.ts` | Fetches messages; `send()` drives the SSE stream and updates the chat store; calls `findSimilar` on first message |
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
| `chatStore.ts` | Streaming state, active conversation, nudges, and first-message tracking |

`chatStore` actions: `setActiveConversation`, `appendToken`, `finalizeStream`, `setStreamError`, `resetStream`, `setNudges`, `clearNudges`, `markFirstMessageSent`.

### Types (`client/src/types/index.ts`)

| Type | Description |
|---|---|
| `User` | `{ userId, username, email? }` |
| `Attachment` | `{ fileId, filename, mimeType, size? }` — user upload reference |
| `MessageDownload` | `{ fileId, filename, description?, version, updated?, size?, created_at? }` — AI-written file |
| `Message` | Chat message with optional `attachments`, `downloads`, `model_used`, `intent` |
| `Conversation` | Metadata with `projectId`, `model_last_used`, `has_files`, `resolved` |
| `ConversationWithMessages` | `Conversation & { messages: Message[] }` |
| `Project` | `{ id, name, description, created_at, conversationCount }` |
| `ProjectDetail` | Project + `contextDoc`, `summary`, `conversations[]` |
| `ProjectDownloadEntry` | `MessageDownload & { conversationId, conversationTitle }` |
| `Intent` | Enum: `WEB_SEARCH` `CODING` `DEBUGGING` `TRANSLATING` `DRAFTING` `SUMMARIZING` `IMAGE_ANALYSIS` |
| `INTENT_CONFIG` | `Record<Intent, { label, icon, description }>` |
| `INTENT_MODEL_LABELS` | Maps raw provider/model strings to human-readable badge labels |
| `SSEEvent` | `token` \| `done` (with `intent` + optional `downloads[]`) \| `error` |
| `LedgerEntry` | One record in `topic-ledger.jsonl` — `date`, `conversationId`, `topics`, `goal`, `intent`, `projectId`, `projectName`, `model`, `messageCount`, `resolved` |
| `PatternReport` | All-time and 4-week topic/intent frequency data; recurring interests; orphan topics |
| `RollingWeek` | One week of aggregated ledger data — `week`, `conversationCount`, `topTopics`, `intents`, `hadUnresolved` |
| `SimilarMatch` | Result from `findSimilar` — `conversationId`, `title`, `goal`, `date`, `resolved`, `score`, `topics` |
| `UnresolvedThread` | Unresolved conversation with `daysSinceCreated` and `goal` for digest rendering |

### Utils (`client/src/utils/`)

`detectIntent(content, hasImages): Intent` — heuristic intent detection, runs synchronously in the browser. Checks patterns in order: IMAGE_ANALYSIS → WEB_SEARCH → TRANSLATING → SUMMARIZING → DRAFTING → DEBUGGING → CODING. Falls back to CODING.
