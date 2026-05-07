# Project Suggestion Service

The `projectSuggestionService` detects topics that the user repeatedly explores but has not yet organized into a project.

## Purpose

To provide proactive organization suggestions by identifying recurring "orphan" topics in the topic ledger.

## Detection Thresholds

A topic is suggested if:
1. It appears in **5 or more distinct conversations**.
2. It appears in **at least 2 different calendar weeks**.
3. It has **never been associated with a `projectId`** (all ledger entries for this topic have `projectId === null`).
4. It was seen **within the last 30 days**.

## Key Functions

### `getProjectSuggestions(): Promise<ProjectSuggestion[]>`
Aggregates the ledger to find topics meeting the thresholds. Returns up to 3 suggestions, sorted by conversation count. Excludes topics previously dismissed by the user. This function performs no AI calls.

### `generateProjectContext(suggestion: ProjectSuggestion): Promise<string>`
Called only when a user accepts a suggestion. Uses the `SUMMARIZING` intent (default) to generate a starter `context.md` for the new project based on the topic's history and goals.

### `dismissSuggestion(topic: string): Promise<void>`
Permanently ignores a topic for project suggestions. Dismissed topics are stored in `data/insights/dismissed-suggestions.json`.

## Data Storage

- **Dismissals**: `data/insights/dismissed-suggestions.json` (simple JSON array of lowercase strings).
- **Ledger Source**: `data/insights/topic-ledger.jsonl`.
