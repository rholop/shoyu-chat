# Storage

Filesystem-only persistence layer. No database.

| Export | Purpose |
|---|---|
| `readUser / writeUser` | Single-user JSON record at `data/user.json` |
| `getUsageCount / incrementUsage` | Per-provider per-day call counts in `data/usage.json` |
| `listConversations` | Scans `data/conversations/` and returns sorted `ConversationSummary[]` |
| `getConversationMeta` | Reads `{id}.json` sidecar |
| `createConversation` | Writes sidecar + empty NDJSON + creates files subdir |
| `updateConversationTitle` | Rewrites the sidecar atomically |
| `deleteConversation` | Removes sidecar, NDJSON, and files subdir |
| `getMessages / appendMessage` | Read/append to `{id}.ndjson` |
| `conversationFilesDir` | Returns `data/conversations/{id}/` path |
| `getRecentlyActiveConversations` | IDs whose NDJSON mtime is within a given window (used for timer recovery) |

## File Layout

```
data/
├── user.json
├── user-memory.md         ← User's long-term memory profile
├── usage.json
├── projects/
│   ├── {uuid}.json          ← Project metadata
│   ├── {uuid}-context.md    ← Project context document
│   └── {uuid}-summary.md    ← Project summary
├── conversations/
│   ├── {uuid}.json          ← ConversationMeta sidecar
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
