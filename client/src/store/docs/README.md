# Store

Zustand stores for client-side state that doesn't belong in TanStack Query.

| File | Purpose |
|---|---|
| `authStore.ts` | `{ user, setUser }` — cached auth user; populated by `useAuth` on mount |
| `chatStore.ts` | Streaming state and active conversation; drives real-time token rendering |

## chatStore

```ts
{
  activeConversationId: string | null
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
  streamError: string | null
}
```

Key actions:
- `setActiveConversation(id)` — switches conversation and clears all streaming state
- `appendToken(text)` — accumulates SSE tokens into `streamingContent`
- `finalizeStream(event, model)` — converts `streamingContent` to a persisted assistant `Message`, clears streaming state
- `setStreamError(msg)` — records error, stops streaming
- `resetStream()` — called before each send to clear prior state
