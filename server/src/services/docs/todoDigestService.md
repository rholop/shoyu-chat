# TodoDigestService

The `TodoDigestService` assembles to-do statistics and categorizes them specifically for consumption by the weekly Sunday digest.

## Purpose
It provides a structured report of to-do activity over the past week and identifies overdue items to be included in the digest email and AI analysis.

## Key Concepts

### Overdue Definition
A to-do is considered "overdue" if:
1. It has a `dueDate` set and `dueDate < today` AND its status is `open`.
2. OR it has a priority of `now`, its status is `open`, and it was created more than 7 days ago.

## Functions

### `buildTodoDigestReport(): Promise<TodoDigestReport>`
Aggregates all to-dos across all conversations and returns a report categorized by:
- `createdThisWeek`: To-dos created in the last 7 days.
- `completedThisWeek`: To-dos marked as `done` in the last 7 days.
- `overdue`: To-dos matching the overdue criteria.
- `totalOpen`: Total count of currently `open` to-dos.
- `totalDone`: Total count of all to-dos ever marked as `done`.

## Data Sources
- Reads `todos.json` from all conversation directories via `todoService.getAllTodosWithStatus()`.
- Resolves conversation titles by reading `meta.json` in the respective conversation directories.

## AI Usage
This service does **not** make any AI calls. It performs pure data aggregation and filtering.
