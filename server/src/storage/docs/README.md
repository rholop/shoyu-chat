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
