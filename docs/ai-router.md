# AI Router

The AI Router classifies message intent and routes requests across multiple providers using a tiered fallback matrix.

## Intent Classification

| Intent | Description |
|---|---|
| `WEB_SEARCH` | Triggers Google Search grounding (Gemini only) |
| `CODING` | Optimized for implementation and script writing |
| `DEBUGGING` | Optimized for log analysis and bug fixing |
| `TRANSLATING` | Language translation tasks |
| `DRAFTING` | General writing and brainstorming |
| `SUMMARIZING` | Conversation and document summarization |
| `IMAGE_ANALYSIS` | Native vision processing for images |

## Fallback Matrix

| Provider | Key Models | Vision | Tools |
|---|---|---|---|
| **NVIDIA** | Llama 3.3 70B | No | Yes |
| **Groq** | Llama 3.3 70B | No | Yes |
| **Gemini** | 2.5 Flash / 2.5 Pro | Yes | Yes |
| **OpenRouter** | Various free models | Yes | Yes |

## Routing Logic

1. Classify intent via regex or manual override.
2. Select the ordered list of tiers for that intent.
3. Check daily usage limits in `usage.json`.
4. Attempt call to the first available tier.
5. Fall back to the next tier if rate-limited or quota-exhausted.

## User Memory Service

`data/user-memory.md` is injected as the first system message on every call. It provides long-term personal context (identity, career, preferences) and is automatically updated during inactivity summarization runs.

## Context Injection Order

1. **User Memory** (Personal profile)
2. **Project Context** (If conversation belongs to a project)
3. **Internal Notes** (Previous web search results)
4. **Conversation History** (Recent messages)
5. **Active File List** (Available downloads context)
