# Routes

Express route handlers defining the shoyu-chat REST API.

| File | Purpose |
|---|---|
| `auth.ts` | Session management: `/login`, `/logout`, and `/me`. |
| `chat.ts` | The core `/send` endpoint for SSE-streamed AI conversations. |
| `conversations.ts` | CRUD operations for conversation metadata and management. |
| `files.ts` | Management of uploaded attachments. |
| `projects.ts` | Management of project context, assignments, and cross-conversation summaries. |

## Chat Route (`/send`)

1. Validates session and parameters.
2. Injects system prompts (Memory, Project Context, Research Notes).
3. Processes attachments for AI context.
4. Streams tokens from `aiRouter`.
5. Persists messages and triggers the summary debounce timer.
