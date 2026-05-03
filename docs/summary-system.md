# Markdown Summary System

The summary system automatically compresses conversation history into structured markdown logs after periods of inactivity.

## Inactivity Debounce

- Triggered after every assistant response.
- **Wait time:** 4 hours of inactivity.
- **Recovery:** On server start, timers are rescheduled for conversations active within the last 4 hours.

## Process Steps

1. **Transcript Parsing:** Read `conversation.ndjson` and extract text-only messages.
2. **Conversation Summary:** Generate a 2-4 sentence summary of goal, approach, and outcome.
3. **One-liner:** Generate a single-sentence "action log" entry.
4. **Weekly Log:** Append the one-liner to `data/summaries/YYYY-WXX.md`.
5. **Monthly Overview:** Update the high-level summary in `data/summaries/YYYY-MM.md`.
6. **Project Summary:** If applicable, regenerate the cross-conversation project summary.
7. **Memory Update:** Merge new personal facts from the conversation into `user-memory.md`.

## File Formats

### Weekly Log (`YYYY-WXX.md`)
Markdown table with Date, Conversation Title, and One-liner summary.

### Monthly Overview (`YYYY-MM.md`)
AI-generated narrative of usage patterns and recurring goals, plus a list of all conversations for the month.

### Project Summary (`summary.md`)
A 3-5 sentence summary of what the project is working toward and what has been accomplished, written in second person.
