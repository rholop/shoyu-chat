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
| `getProjectMeta` | Reads `project-{id}/meta.json` or returns `null` |
| `createProject` | Creates `project-{id}/` with `meta.json`, empty `context.md`, empty `summary.md` |
| `updateProject` | Rewrites `project-{id}/meta.json` atomically |
| `deleteProject` | Removes the entire `project-{id}/` directory |
| `getProjectContext / writeProjectContext` | Read/write `project-{id}/context.md` |
| `getProjectSummary / writeProjectSummary` | Read/write `project-{id}/summary.md` |

### Conversations

| Export | Purpose |
|---|---|
| `listConversations` | Scans `data/` for `conversation-*/` dirs and returns sorted `ConversationSummary[]` |
| `listConversationsByProject` | Filtered list for a given `projectId` |
| `getConversationMeta` | Reads `conversation-{id}/meta.json` |
| `createConversation` | Creates `conversation-{id}/` with `meta.json`, empty `conversation.ndjson`, `uploads/`, and `downloads/` subdirs; optional `projectId` |
| `updateConversationTitle` | Rewrites `conversation-{id}/meta.json` atomically |
| `assignConversationProject` | Sets or clears `projectId` in `conversation-{id}/meta.json` |
| `deleteConversation` | Removes the entire `conversation-{id}/` directory |
| `getMessages / appendMessage` | Read/append to `conversation-{id}/conversation.ndjson` |
| `conversationFilesDir` | Returns the `conversation-{id}/uploads/` path |
| `getRecentlyActiveConversations` | IDs whose `conversation.ndjson` mtime is within a given window (used for summary timer recovery on boot) |

## File Layout

```
data/
├── user.json
├── usage.json
├── user-memory.md                        (gitignored)
│
├── conversation-{id}/
│   ├── meta.json                         ← ConversationMeta (title, projectId, created_at)
│   ├── conversation.ndjson               ← one StoredMessage per line
│   ├── uploads/
│   │   └── {fileId}-{filename}           ← user-uploaded files
│   └── downloads/
│       ├── {fileId}-{filename}           ← AI-generated / fetched files
│       └── .versions/
│           └── {fileId}-v{n}-{filename}  ← versioned history of downloads
│
├── project-{id}/
│   ├── meta.json                         ← ProjectMeta (id, name, description, created_at)
│   ├── context.md                        ← free-form context document (injected into chat)
│   └── summary.md                        ← AI-generated project summary
│
└── summaries/
    ├── YYYY-WXX.md                       ← weekly one-liner table
    └── YYYY-MM.md                        ← monthly overview
```

All writes are atomic: content is written to a `.tmp` file then `rename()`d into place.
