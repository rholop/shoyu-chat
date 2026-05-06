# Services

Business logic and external integrations.

| File | Purpose |
|---|---|
| `aiRouter.ts` | Routes chat/summarize calls across providers using the intent-based fallback matrix |
| `groqService.ts` | Groq API — `streamChatGroqChat` (llama-3.3-70b-versatile), `summarizeGroq` |
| `geminiService.ts` | Google Gemini API — handles text, image (vision), and web-search grounding inputs |
| `nvidiaService.ts` | NVIDIA NIM API — `streamChatNvidia`, `summarizeNvidia`, `isNvidiaAvailable` |
| `openrouterService.ts` | OpenRouter free-tier models — `streamChatOpenRouter`, `summarizeOpenRouter` |
| `fileService.ts` | Extract AI-usable context from uploaded files (PDF, text, images) |
| `summaryService.ts` | 4-hour inactivity debounce → triggers AI summarization of conversations |
| `markdownService.ts` | Read/write chat files and weekly/monthly summary markdown files |
| `emailService.ts` | Send weekly digest HTML email via Resend |
| `memoryService.ts` | Read/write `data/user-memory.md`; `updateMemoryFromConversation` merges new facts using NVIDIA Llama 3.1 405B (fallback: Gemini) |
| `projectService.ts` | `regenerateProjectSummary` — builds an AI summary from all conversations in a project |

## memoryService

`readMemory()` returns the raw markdown or `null` if the file doesn't exist. `writeMemory(content)` enforces a 4,000-word cap before writing atomically. `updateMemoryFromConversation(transcript)` calls the memory-architect prompt and writes the result.

## projectService

`getContext(projectId)` is a thin wrapper over storage. `regenerateProjectSummary(projectId)` fetches all project conversations, summarizes each with `aiRouter.summarize()`, then synthesizes a 3–5 sentence project summary written in second person.

## nvidiaService

Uses the OpenAI SDK pointed at `https://integrate.api.nvidia.com/v1`. `isNvidiaAvailable()` returns `true` when `NVIDIA_API_KEY` is set. Timeout per request: 60 s.

See `/docs/ai-router.md` and `/docs/file-uploads.md` for deeper design notes.
