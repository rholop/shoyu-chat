# LoopsPanel Component

The main view for managing open loops, located at `/chat/loops`.

## Features
- Displays a list of all unresolved conversations that aren't currently snoozed.
- Sorted by `daysSinceCreated` descending (oldest first) to highlight aging tasks.
- Filtering by:
  - **Intent**: Dynamically populated from the current set of open loops.
  - **Age**: Filters for loops older than 7, 14, or 30 days.
  - **Project**: Filters by project association.

## States
- **Loading**: Shows skeleton rows.
- **Empty**: Displays an inbox icon with a message indicating no loops are open.
- **Error**: Shows an error message with a retry button.

## Data Fetching
Uses the `useLoops` hook which leverages `@tanstack/react-query` for caching and synchronization.
