# Architecture

shoyu-chat is a single-user PWA chat application served at `holop.dev/chat`.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Zustand + TanStack Query
- **Backend**: Node.js + Express 5 + TypeScript
- **Storage**: Filesystem (no database) — `$DATA_DIR`
- **Auth**: JWT in `httpOnly` cookie + bcrypt
- **AI Providers**: Groq, Gemini, OpenRouter (free tiers)
- **Email**: Resend
- **Scheduler**: node-cron
- **Process manager**: PM2 (port 3001)

## Request Flow

```
Browser → Nginx (holop-web) → :3001 (shoyu-chat server)
                              ├── /api/*  → Express routes
                              └── /chat/* → static React build
```

## Data Directory Layout

```
data/
├── user.json              Single user record
├── user-memory.md         User's long-term memory profile
├── usage.json             Daily API usage counters per provider
├── projects/
│   ├── {id}.json          Project metadata
│   ├── {id}-context.md    Project context document
│   └── {id}-summary.md    Project summary
├── conversations/
│   ├── {id}.json          Conversation metadata
│   ├── {id}.ndjson        Messages (append-only)
│   └── {id}/              Uploaded files for this conversation
│       └── {fileId}-{filename}
├── chats/
│   └── YYYY-MM-DD-{id}.md Per-conversation AI summary
└── summaries/
    ├── YYYY-WXX.md        Weekly one-liner table
    └── YYYY-MM.md         Monthly AI-generated overview
```

## Key Design Decisions

- **No database**: Single-user app; filesystem is simpler and portable.
- **NDJSON for messages**: Append-only format avoids read-modify-write races.
- **Atomic writes**: All JSON/markdown writes go through `.tmp` → `rename` to prevent corruption.
- **SSE for streaming**: Server-sent events pipe AI tokens to the browser as they arrive.
- **Provider routing**: groq-compound (web search) → groq-chat → gemini (vision) → openrouter, each with independent daily limits.
- **Inactivity summaries**: 4-hour debounce timer after each message triggers an AI-generated markdown summary.
