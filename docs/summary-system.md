# Summary System

## Inactivity Debounce

After every AI response, `summaryService.schedule(conversationId)` is called. This sets (or resets) a 4-hour timer. When the timer fires, `runSummary()` executes.

On server boot, `recoverSummaryTimers()` reschedules timers for any conversation whose NDJSON `mtime` is within the last 4 hours.

## Summary Run Steps

1. Read all messages from `{id}.ndjson`
2. Generate a **full summary** (2–4 sentences) → write `data/chats/YYYY-MM-DD-{id}.md`
3. Generate a **topics list** (3–6 noun phrases) → included in the chat file
4. Generate a **one-liner** → upsert a row in `data/summaries/YYYY-WXX.md`
5. Regenerate the **monthly overview** → rewrite `data/summaries/YYYY-MM.md`

All file writes are atomic (`.tmp` → `rename`).

## AI Prompts

- **Full summary**: 2–4 sentences covering goal, approach, outcome
- **One-liner**: single sentence starting with a verb, describing the user's goal
- **Topics**: 3–6 comma-separated concrete noun phrases
- **Monthly overview**: 3–4 sentences in second person ("You spent…"), covering recurring themes

Summarization uses `aiRouter.summarize()` which routes to groq-chat → gemini → openrouter, skipping groq-compound to preserve its chat budget.
