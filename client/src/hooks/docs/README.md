# Hooks

Custom React hooks that encapsulate data fetching and side-effect logic.

| File | Purpose |
|---|---|
| `useAuth.ts` | TanStack Query wrapper for `/api/auth/me`; exposes `login`, `logout`, `user`, loading/error state |
| `useChat.ts` | Fetches conversation messages; `send()` drives the SSE stream and updates Zustand chat store |
| `useConversations.ts` | List, create, delete, rename conversations via TanStack Query mutations |
| `useFileUpload.ts` | Manages pending attachment state; `upload(files)` calls `uploadFile` API; `remove(fileId)` calls `deleteFile` |

## useFileUpload

```ts
const { attachments, uploading, uploadError, upload, remove, clear } = useFileUpload(conversationId);
```

- `upload(FileList | File[])` — uploads sequentially, accumulates results, sets error on failure
- `remove(fileId)` — removes optimistically from state, calls DELETE in background (errors ignored)
- `clear()` — resets attachment list and error (called after message send)
- No-ops when `conversationId` is `null`
