# Routes

Express route handlers for the API.

| File | Purpose |
|---|---|
| `auth.ts` | Login, logout, /me — sets/clears the JWT cookie |
| `chat.ts` | `POST /send` — SSE streaming chat with optional file attachments |
| `conversations.ts` | CRUD for conversations (list, get, create, rename, delete); `POST /:id/assign` to assign a project |
| `files.ts` | File upload (`POST /upload`), retrieval, and deletion |
| `projects.ts` | CRUD for projects; `GET /:id/context` and `PUT /:id/context` for the project context document |

All routes except auth are protected by `requireAuth` middleware mounted in `index.ts`.

## Chat Route

The `/send` endpoint sets SSE headers immediately, then streams tokens. After the stream finishes it persists both messages, optionally auto-titles the conversation from the first message, and schedules a summary timer.

File contexts are injected into the AI message before routing: text/PDF/code files become fenced code blocks prepended to the user content; images are passed as `ImageAttachment` objects and routed to a vision-capable model.

The `intent` field from the request body is forwarded to `aiRouter.streamChat()` so the correct provider tier list is selected.

## Projects Route

| Method | Path | Action |
|---|---|---|
| `GET` | `/api/projects` | List all projects with conversation counts |
| `POST` | `/api/projects` | Create project (`name`, `description`) |
| `GET` | `/api/projects/:id` | Get project meta, contextDoc, summary, and conversations |
| `PATCH` | `/api/projects/:id` | Update name/description |
| `DELETE` | `/api/projects/:id` | Unassign all conversations then delete project files |
| `GET` | `/api/projects/:id/context` | Return raw context document |
| `PUT` | `/api/projects/:id/context` | Overwrite context document |
