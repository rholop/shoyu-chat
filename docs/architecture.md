# Architecture

shoyu-chat is a single-user PWA chat application served at `holop.dev/chat`.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Zustand + TanStack Query
- **Backend**: Node.js + Express 5 + TypeScript
- **Storage**: Filesystem (no database) — `$DATA_DIR`
- **Auth**: JWT in `httpOnly` cookie + bcrypt
- **AI Providers**: Groq, Gemini, NVIDIA, OpenRouter (free tiers)
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

Please see the [Storage README](../server/src/storage/docs/README.md) for the filesystem layout.

## Key Design Decisions

- **No database**: Single-user app; filesystem is simpler and portable.
- **NDJSON for messages**: Append-only format avoids read-modify-write races.
- **Atomic writes**: All JSON/markdown writes go through `.tmp` → `rename` to prevent corruption.
- **SSE for streaming**: Server-sent events pipe AI tokens to the browser as they arrive.
- **Intent-based provider routing**: The user selects an intent (Coding, Debugging, Web Search, etc.) and the AI router picks the best provider/model tier for that intent, falling back down the tier list on failure or quota exhaustion. See [AI Router](./ai-router.md).
- **User memory**: A persistent `data/user-memory.md` profile is injected as a system prompt into every chat request, keeping long-term context across conversations. Updated after each summarization run using NVIDIA Llama 3.1 405B (fallback: Gemini).
- **Projects**: Conversations can be grouped into projects. Each project has a free-form context document and an AI-generated summary synthesized from its conversations. Project context is injected into chat requests when present.
- **Inactivity summaries**: 4-hour debounce timer after each AI response triggers an AI-generated markdown summary of the conversation.
- **Theme**: Dark/light mode switches automatically at 6 AM and 6 PM local time.
