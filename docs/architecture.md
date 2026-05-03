# Architecture

shoyu-chat is a mobile-first, desktop-compatible PWA served at `holop.dev/chat`.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Zustand + TanStack Query
- **Backend**: Node.js + Express + TypeScript
- **Storage**: Filesystem (no database) — `$DATA_DIR`
- **Auth**: JWT in `httpOnly` cookie + bcrypt
- **AI Providers**: Groq, Gemini, OpenRouter, NVIDIA (free tiers)
- **Email**: Resend
- **Scheduler**: node-cron
- **Process manager**: PM2 (port 3001)

## Request Flow

```
Browser → Nginx (holop-web) → :3001 (shoyu-chat server)
                              ├── /api/*  → Express routes
                              └── /chat/* → static React build
```

## Repository Structure

```
shoyu-chat/
├── client/             # React PWA
├── server/             # Express API
├── data/               # Persistent storage (gitignored)
├── scripts/            # Seed, backup, and migration scripts
└── docs/               # System documentation
```

## Data Storage (Redesigned)

No database. All state lives in `$DATA_DIR` as plain files. Conversations and projects each live in **self-contained named directories**.

### Layout

```
data/
├── user.json                 # Single user record
├── usage.json                # Daily API usage counters
├── user-memory.md            # Persistent personal profile
├── conversation-{id}/        # Self-contained conversation directory
│   ├── meta.json             # Title, projectId, created_at
│   ├── conversation.ndjson   # Messages (append-only)
│   ├── uploads/              # User-uploaded files
│   └── downloads/            # AI-created files (WRITE_FILE)
└── project-{id}/             # Self-contained project directory
    ├── meta.json             # Name, description, created_at
    ├── context.md            # User-written context doc
    └── summary.md            # AI-generated cross-conversation summary
```

## Auth System

- Single user with credentials in `data/user.json`.
- Password hashed with `bcrypt`.
- JWT stored in `httpOnly` cookie for session management.

## Frontend (PWA)

- Responsive design for mobile and desktop.
- Served under `/chat` base path.
- Uses SSE for real-time AI response streaming.
