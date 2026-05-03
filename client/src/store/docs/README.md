# Store

Client-side global state management using **Zustand**.

| File | Purpose |
|---|---|
| `authStore.ts` | Stores the current user profile and session status. |
| `chatStore.ts` | Stores transient UI state (sidebar open, current conversation ID). |

Server-derived data (conversations, project details) is managed by TanStack Query and is NOT stored in Zustand.
