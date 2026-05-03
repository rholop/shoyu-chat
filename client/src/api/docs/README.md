# API

Thin wrapper around the fetch API for communicating with the shoyu-chat backend.

| File | Purpose |
|---|---|
| `auth.ts` | Login, Logout, and Identity endpoints. |
| `chat.ts` | SSE event source setup and send logic. |
| `conversations.ts` | Meta and history retrieval. |
| `projects.ts` | Project and context management. |
| `files.ts` | Upload and deletion endpoints. |

- **Security:** Relies on `httpOnly` cookies; no manual token handling in JS.
- **Base Path:** All requests are prefixed with `/api`.
