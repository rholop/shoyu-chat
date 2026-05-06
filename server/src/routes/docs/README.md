# Routes

Express route handlers for the API.

| File | Purpose |
|---|---|
| `auth.ts` | Login, logout, /me — sets/clears the JWT cookie |
| `chat.ts` | `POST /send` — SSE streaming chat with optional file attachments |
| `conversations.ts` | CRUD for conversations; download endpoints for AI-written files |
| `files.ts` | File upload (`POST /upload`), retrieval, and deletion |
| `projects.ts` | CRUD for projects; context document; project-level downloads list |
| `search.ts` | Full-text search query and index rebuild |

All routes except auth are protected by `requireAuth` middleware mounted in `index.ts`.

## Chat Route

The `/send` endpoint sets SSE headers immediately, then streams tokens. After the stream finishes it persists both messages, optionally auto-titles the conversation from the first message, and schedules a summary timer.

File contexts are injected into the AI message before routing: text/PDF/code files become fenced code blocks prepended to the user content; images are passed as `ImageAttachment` objects and routed to a vision-capable model.

The `intent` field from the request body is forwarded to `aiRouter.streamChat()` so the correct provider tier list is selected.

When the AI calls the `write_file` tool during a response, the route writes the file to `conversation-{id}/downloads/` via `fileService.writeDownload` and includes the resulting `DownloadEntry[]` in the SSE `done` event.

## Conversations Route

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/conversations` | List all conversations |
| `GET` | `/api/conversations/:id` | Get conversation with messages |
| `POST` | `/api/conversations` | Create conversation (optional `projectId`) |
| `PATCH` | `/api/conversations/:id` | Rename conversation |
| `DELETE` | `/api/conversations/:id` | Delete conversation and all its files |
| `POST` | `/api/conversations/:id/assign` | Assign or unassign a project |
| `GET` | `/api/conversations/:id/downloads` | List AI-written downloads for a conversation |
| `GET` | `/api/conversations/:id/downloads/:fileId` | Stream a specific download file |

## Projects Route

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/projects` | List all projects with conversation counts |
| `POST` | `/api/projects` | Create project (`name`, `description`) |
| `GET` | `/api/projects/:id` | Get project meta, contextDoc, summary, and conversations |
| `PATCH` | `/api/projects/:id` | Update name/description |
| `DELETE` | `/api/projects/:id` | Unassign all conversations then delete project directory |
| `GET` | `/api/projects/:id/context` | Return raw context document |
| `PUT` | `/api/projects/:id/context` | Overwrite context document |
| `GET` | `/api/projects/:id/downloads` | List all downloads across conversations in the project |

## Search Route

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/search?q=...` | Search the index; supports `projectId`, `types`, `limit` query params |
| `POST` | `/api/search/rebuild` | Rebuild the full index from disk (also available as `npm run search:reindex`) |

The index is auto-seeded on server startup if `data/search-index.jsonl` is missing.
