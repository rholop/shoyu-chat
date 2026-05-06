# Services

Business logic and external integrations.

| File | Purpose |
|---|---|
| `aiRouter.ts` | Routes chat/summarize calls across providers using the intent-based fallback matrix; exposes the `WRITE_FILE_TOOL` definition used by all providers |
| `groqService.ts` | Groq API — `streamChatGroqChat`, `streamChatGroqChatWithTools`, `summarizeGroq` |
| `geminiService.ts` | Google Gemini API — handles text, image (vision), web-search grounding, and tool calls |
| `nvidiaService.ts` | NVIDIA NIM API — `streamChatNvidia`, `streamChatNvidiaWithTools`, `summarizeNvidia`, `isNvidiaAvailable` |
| `openrouterService.ts` | OpenRouter free-tier models — `streamChatOpenRouter`, `streamChatOpenRouterWithTools`, `summarizeOpenRouter` |
| `fileService.ts` | Context extraction from uploads; `writeDownload` / `getConversationDownloads` / `getProjectDownloads` for AI-written files |
| `summaryService.ts` | 4-hour inactivity debounce → triggers AI summarization of conversations |
| `markdownService.ts` | Read/write `chats/` and `summaries/` files; indexes each write into the search index |
| `emailService.ts` | Send weekly digest HTML email via Resend |
| `memoryService.ts` | Read/write `data/user-memory.md`; `updateMemoryFromConversation` merges new facts using NVIDIA Llama 3.1 405B (fallback: Gemini) |
| `projectService.ts` | `regenerateProjectSummary` — builds an AI summary from all conversations in a project |
| `searchExtractor.ts` | Converts messages, projects, files, and summaries into `SearchRecord[]` for the index |
| `searchIndexService.ts` | Append-only NDJSON index at `data/search-index.jsonl`; serializes writes through a promise queue |
| `searchService.ts` | Full-text search over the index — phrase matching, multi-term AND, fuzzy fallback, recency + project-relevance scoring |

## fileService — downloads

`writeDownload(conversationId, filename, content, description, existingFileId?)` writes AI-generated content to `conversation-{id}/downloads/`. If `existingFileId` is provided the current file is versioned into `.versions/` (last 3 kept) before being overwritten.

## searchIndexService

Records are keyed by `id` and stored as one JSON line each. `indexRecord` appends after removing any existing record with the same id. `removeRecordsBySourcePrefix` streams the file and drops all records whose `sourcePath` starts with the given prefix (used when deleting a conversation or project).

## memoryService

`readMemory()` returns the raw markdown or `null` if the file doesn't exist. `writeMemory(content)` enforces a 4,000-word cap before writing atomically. `updateMemoryFromConversation(transcript)` calls the memory-architect prompt and writes the result.

See `/docs/ai-router.md` and `/docs/file-uploads.md` for deeper design notes.
