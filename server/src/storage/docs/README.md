# Storage

Filesystem-only persistence layer. No database.

## Exports

### User

| Export | Purpose |
|---|---|
| `readUser / writeUser` | Single-user JSON record at `data/user.json` |

### API Usage

| Export | Purpose |
|---|---|
| `getUsageCount` | Per-provider per-day call count from `data/usage.json` |
| `incrementUsage` | Increment count on first token received |
| `setUsageCount` | Force-set a count (used to auto-exhaust a provider on 402/403) |

### Projects

| Export | Purpose |
|---|---|
| `listProjects` | Returns all `ProjectMeta[]` sorted by `created_at` |
| `getProjectMeta` | Reads `{id}.json` or returns `null` |
| `createProject` | Writes meta JSON + empty context + empty summary files |
| `updateProject` | Rewrites meta atomically |
| `deleteProject` | Removes meta, context, and summary files |
| `getProjectContext / writeProjectContext` | Read/write `{id}-context.md` |
| `getProjectSummary / writeProjectSummary` | Read/write `{id}-summary.md` |

### Conversations

| Export | Purpose |
|---|---|
| `listConversations` | Scans `data/conversations/` and returns sorted `ConversationSummary[]` |
| `listConversationsByProject` | Filtered list for a given `projectId` |
| `getConversationMeta` | Reads `{id}.json` sidecar |
| `createConversation` | Writes sidecar + empty NDJSON + creates files subdir; optional `projectId` |
| `updateConversationTitle` | Rewrites the sidecar atomically |
| `assignConversationProject` | Sets or clears `projectId` on the sidecar |
| `deleteConversation` | Removes sidecar, NDJSON, and files subdir |
| `getMessages / appendMessage` | Read/append to `{id}.ndjson` |
| `conversationFilesDir` | Returns `data/conversations/{id}/` path |
| `getRecentlyActiveConversations` | IDs whose NDJSON mtime is within a given window (used for summary timer recovery on boot) |

## File Layout

```
data/
├── user.json
├── user-memory.md         ← long-term user memory profile
├── usage.json
├── projects/
│   ├── {uuid}.json          ← ProjectMeta (id, name, description, created_at)
│   ├── {uuid}-context.md    ← free-form context document (injected into chat)
│   └── {uuid}-summary.md    ← AI-generated project summary
├── conversations/
│   ├── {uuid}.json          ← ConversationMeta sidecar (title, projectId, created_at)
│   ├── {uuid}.ndjson        ← one StoredMessage per line
│   └── {uuid}/              ← uploaded files directory
│       └── {file-uuid}-{name}
├── chats/
│   └── YYYY-MM-DD-{uuid}.md ← AI-generated chat summary
└── summaries/
    ├── YYYY-WXX.md          ← weekly one-liner table
    └── YYYY-MM.md           ← monthly overview
```

All writes are atomic: content is written to a `.tmp` file then `rename()`d into place.
