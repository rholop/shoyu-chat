# insightsService

The `insightsService` is responsible for analyzing the topic ledger and generating structured pattern reports. These reports summarize user activity, topic trends, and project engagement over time.

## Pattern Report Structure

The `PatternReport` object consists of four main sections:

### `allTime`
Provides a high-level overview of all conversations since the ledger began.
- `topTopics`: Top 10 most frequent topics.
- `topIntents`: Distribution of conversation intents.
- `totalConversations`: Total number of ledger entries.
- `totalMessages`: Sum of all messages across all conversations.
- `mostActiveProject`: The project with the highest number of conversations.
- `topicsWithoutProject`: Top 5 topics that have never been associated with a project.

### `last4Weeks`
Focuses on recent activity within the last 28 days.
- `topTopics`: Top 10 topics in the recent period.
- `topIntents`: Intent distribution in the recent period.
- `newTopics`: Topics appearing for the first time in the last 4 weeks.
- `returningTopics`: Topics seen in the last 4 weeks that also appeared previously.
- `weeklyConversationCounts`: A breakdown of conversation counts per ISO week for the last 4 weeks.

### `recurring`
Identifies long-term patterns and persistent interests.
- `topicsSeenMultipleWeeks`: Topics that appear in 3 or more distinct ISO weeks.
- `longestRunningTopic`: The topic that has been seen across the most distinct weeks.

## Key Logic

### Orphan Interests (`topicsWithoutProject`)
A topic is considered an "orphan interest" if it appears in at least one ledger entry where `projectId` is null, and it NEVER appears in any entry where `projectId` is set.

### Trend Detection
- **New Topics**: Topics that appear in the last 4 weeks but do not exist in the ledger older than 4 weeks.
- **Returning Topics**: Topics that appear in the last 4 weeks and also exist in the older portion of the ledger.

### Performance
The service uses plain array operations for all computations, ensuring it is fast and deterministic without requiring additional AI calls. It reads the full ledger file once per report generation.

## Open Loops

### `getUnresolvedThreads(): Promise<OpenLoop[]>`
Returns all conversations where `resolved === false`, sorted by `created_at` descending. Conversations where `snoozedUntil >= today` (UTC date) are excluded from the result. Each result is enriched with:
- `daysSinceCreated` — computed at query time
- `goal`, `intent`, `topics` — pulled from the topic ledger, defaulting to empty values if no ledger entry exists
- `projectName` — resolved from project metadata

### `snoozeLoop(conversationId: string, snoozedUntil: string): Promise<void>`
Sets the `snoozedUntil` field on a conversation's `meta.json` to the given `YYYY-MM-DD` date. The loop will be excluded from `getUnresolvedThreads()` until that date passes. Throws `Error('Conversation not found')` if the meta file does not exist. Uses `atomicWrite` to persist the change.

### `resolveLoop(conversationId: string): Promise<void>`
Sets `resolved: true`, clears `snoozedUntil` to `null`, and records `resolvedAt` (ISO timestamp) in a conversation's `meta.json`. Throws `Error('Conversation not found')` if the meta file does not exist. Uses `atomicWrite` to persist the change.

## Related Services

- **`projectSuggestionService`**: Uses the same ledger data to generate actionable suggestions for new projects. While `insightsService` provides a broad overview, the suggestion service applies specific thresholds to trigger proactive UI banners and weekly digest recommendations.
