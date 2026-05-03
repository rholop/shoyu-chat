# Storage

Filesystem-based data persistence layer. No external database is required.

| File | Purpose |
|---|---|
| `index.ts` | Unified interface for reading/writing all entities (Users, Projects, Conversations, Usage). |

## Key Concepts

- **Atomic Writes:** All critical file writes use a `.tmp` and `rename` strategy to prevent corruption.
- **Data Directory:** Defined by `DATA_DIR` env var, defaults to the project root `/data`.
- **Entities:**
  - `user.json`: Credentials and profile.
  - `usage.json`: Daily API counters.
  - `conversation-{id}/`: Directory per conversation.
  - `project-{id}/`: Directory per project.

## File Layout

```
data/
├── user.json                          # Single user record
├── usage.json                         # Daily API usage counters
├── user-memory.md                     # Persistent personal profile
│
├── conversation-{id}/                 # One directory per conversation
│   ├── meta.json                      # Metadata (title, projectId, created_at)
│   ├── conversation.ndjson            # Messages (append-only)
│   ├── uploads/                       # User-uploaded files
│   └── downloads/                     # AI-created files via WRITE_FILE
│       ├── {fileId}-{filename}
│       └── .versions/                 # Previous versions (max 3 per file)
│           └── {fileId}-v{n}-{filename}
│
├── project-{id}/                      # One directory per project
│   ├── meta.json                      # Metadata (name, description, created_at)
│   ├── context.md                     # User-written context document
│   └── summary.md                     # AI-generated cross-conversation summary
│
└── summaries/                         # Aggregated AI summaries
    ├── YYYY-WXX.md                    # Weekly one-liner table
    └── YYYY-MM.md                     # Monthly overview
```
