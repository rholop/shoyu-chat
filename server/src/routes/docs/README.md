# Routes

Express route handlers for the API.

| File | Purpose |
|---|---|
| `auth.ts` | Login, logout, /me — sets/clears the JWT cookie |
| `chat.ts` | `POST /send` — SSE streaming chat with optional file attachments |
| `conversations.ts` | CRUD for conversations (list, get, create, rename, delete) |
| `files.ts` | File upload (`POST /upload`), retrieval, and deletion |

All routes except auth are protected by `requireAuth` middleware mounted in `index.ts`.

## Chat Route

The `/send` endpoint sets SSE headers immediately, then streams tokens. After the stream finishes it persists both messages, optionally auto-titles the conversation from the first message, and schedules a summary timer.

File contexts are injected into the AI message before routing: text/PDF/code files become fenced code blocks prepended to the user content; images are passed as `ImageAttachment` objects and routed to a vision-capable model.
