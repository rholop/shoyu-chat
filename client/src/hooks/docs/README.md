# Hooks

Reusable React hooks for state management and API interaction.

| File | Purpose |
|---|---|
| `useAuth.ts` | Session state, login/logout actions. |
| `useChat.ts` | Managing SSE streaming and message sending state. |
| `useConversations.ts` | CRUD hooks for conversation list and meta. |
| `useFileUpload.ts` | Logic for handling multi-file uploads and progress. |
| `useProjects.ts` | CRUD hooks for project management. |
| `useFileDownload.ts` | Triggering downloads for AI-created files. |

All hooks use **TanStack Query** for caching, refetching, and optimistic updates.
