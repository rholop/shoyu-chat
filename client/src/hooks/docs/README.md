# Hooks

Custom React hooks that encapsulate data fetching and side-effect logic.

| File | Purpose |
|---|---|
| `useAuth.ts` | TanStack Query wrapper for `/api/auth/me`; exposes `login`, `logout`, `user`, loading/error state |
| `useChat.ts` | Fetches conversation messages; `send()` drives the SSE stream and updates Zustand chat store |
| `useConversations.ts` | List, create, delete, rename conversations via TanStack Query mutations |
| `useFileUpload.ts` | Manages pending attachment state; `upload(files)` calls `uploadFile` API; `remove(fileId)` calls `deleteFile` |
| `useFileDownload.ts` | `download(conversationId, fileId, filename)` — triggers a browser download from `/api/conversations/:id/downloads/:fileId` |
| `useProjects.ts` | TanStack Query wrappers for projects — `useProjects()` and `useProject(id)` |
| `useSearch.ts` | Debounced search hook (300 ms); wraps the `/api/search` endpoint |
| `useTheme.ts` | Applies dark/light class to `<html>` based on time of day; switches at 6 AM and 6 PM; rechecks every minute |

## useFileUpload

```ts
const { attachments, uploading, uploadError, upload, remove, clear } = useFileUpload(conversationId);
```

- `upload(FileList | File[])` — uploads sequentially, accumulates results, sets error on failure
- `remove(fileId)` — removes optimistically from state, calls DELETE in background (errors ignored)
- `clear()` — resets attachment list and error (called after message send)
- No-ops when `conversationId` is `null`

## useProjects / useProject

```ts
const { projects, isLoading, create, update, remove, refresh } = useProjects();
const { project, isLoading, updateContext, assign, refresh } = useProject(id);
```

- `create({ name, description })` — POST /api/projects, invalidates projects list
- `update(id, fields)` — PATCH /api/projects/:id
- `remove(id)` — DELETE /api/projects/:id, also invalidates conversations list
- `updateContext(content)` — PUT /api/projects/:id/context
- `assign(conversationId, projectId | null)` — POST /api/conversations/:id/assign

## useSearch

```ts
const { query, setQuery, results, isLoading, error, performSearch } = useSearch(options);
```

Setting `query` triggers a debounced search after 300 ms. `performSearch(q, options)` runs immediately without debounce. Results are `SearchResult[]` sorted by relevance score.
