# API

Thin fetch wrappers for each backend resource. All functions use `credentials: 'include'` so the JWT cookie is sent automatically.

| File | Purpose |
|---|---|
| `auth.ts` | `login`, `logout`, `getMe` |
| `chat.ts` | `sendMessage` — SSE generator that yields `SSEEvent` objects |
| `conversations.ts` | `listConversations`, `getConversation`, `createConversation`, `deleteConversation`, `updateConversationTitle` |
| `files.ts` | `uploadFile` (FormData POST), `deleteFile`, `getFileUrl` |

## SSE Streaming

`sendMessage` returns an `AsyncGenerator<SSEEvent>`. It reads the response body as a `ReadableStream`, buffers across chunk boundaries, and parses complete `data: {...}\n\n` frames. Malformed JSON frames are silently skipped.

Event shapes:
```ts
{ type: 'token'; content: string }
{ type: 'done'; model: string; conversationId: string }
{ type: 'error'; message: string }
```
