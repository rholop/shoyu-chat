# Date Helpers

Utility functions for handling dates and keys for grouping data.

## Functions

### `getToday(): string`
Returns the current UTC date in `YYYY-MM-DD` format.

### `getISOWeekKey(date?: Date): string`
Returns the ISO week key (Monday-based) in `YYYY-WXX` format for the given date (defaults to now).

### `getMonthKey(date?: Date): string`
Returns the month key in `YYYY-MM` format for the given date (defaults to now).

### `getWeekRangeLabel(date?: Date): string`
Returns a human-readable Monday–Sunday date range string for the given date, e.g., "Apr 20 – Apr 26, 2026".

### `getMonthLabel(date?: Date): string`
Returns the full month name and year, e.g., "April 2026".

### `getDateDaysAgo(days: number): string`
Returns the UTC date string in `YYYY-MM-DD` format for `n` days ago.
- `getDateDaysAgo(0)` returns today's date.
- `getDateDaysAgo(7)` returns the date one week ago.
