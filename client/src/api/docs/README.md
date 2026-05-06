# API

Thin fetch wrappers for each backend resource. All functions use `credentials: 'include'` so the JWT cookie is sent automatically.

| File | Purpose |
|---|---|
| `auth.ts` | `login`, `logout`, `getMe` |
| `chat.ts` | `sendMessage` — SSE generator that yields `SSEEvent` objects |
| `conversations.ts` | `listConversations`, `getConversation`, `createConversation`, `deleteConversation`, `updateConversationTitle` |
| `files.ts` | `uploadFile` (FormData POST), `deleteFile`, `getFileUrl` |
| `projects.ts` | `listProjects`, `getProject`, `createProject`, `updateProject`, `deleteProject`, `getProjectContext`, `updateProjectContext`, `assignConversation` |
| `search.ts` | `search(q, options)` — full-text search; `rebuildSearchIndex()` — triggers server index rebuild |

## SSE Streaming

`sendMessage` returns an `AsyncGenerator<SSEEvent>`. It reads the response body as a `ReadableStream`, buffers across chunk boundaries, and parses complete `data: {...}\n\n` frames. Malformed JSON frames are silently skipped.

Event shapes:
```ts
{ type: 'token'; content: string }
{ type: 'done'; model: string; conversationId: string; intent: Intent; downloads?: MessageDownload[] }
{ type: 'error'; message: string }
```

When the AI used the `write_file` tool, the `done` event includes a `downloads` array so the client can display download chips immediately.
