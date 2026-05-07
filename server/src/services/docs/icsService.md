# icsService

The `icsService` provides functionality to generate iCalendar (.ics) files for to-dos. This allows users to export their tasks to external calendar applications like Apple Calendar or Google Calendar.

## Purpose

Generates a standard iCalendar formatted string from an array of to-do items.

## Format Details

The service follows the iCalendar (RFC 5545) specification:
- **VCALENDAR**: The root container.
- **VEVENT**: Each to-do is represented as a single-day event.
- **All-Day Events**: Uses `VALUE=DATE` format for `DTSTART` and `DTEND`.
- **Date Handling**: `DTEND` is always set to `DTSTART + 1 day` as required by the spec for all-day events.
- **Text Escaping**: Special characters like commas (`,`), semicolons (`;`), backslashes (`\`), and newlines (`\n`) are escaped according to the spec.

## Exported Functions

### `generateIcs(todos: TodoWithTitle[]): string`

Takes an array of `TodoWithTitle` objects and returns a valid `.ics` string.

**Parameters:**
- `todos`: An array of `TodoWithTitle` objects. Each object must include the standard `Todo` fields plus a `conversationTitle`.

**Returns:**
- A string representing the `.ics` file content.

**Errors:**
- Throws an error if the `todos` array is empty.

## Helper Functions (Internal)

- `toIcsDate(isoString: string)`: Converts an ISO date string to `YYYYMMDD`.
- `toIcsTimestamp(date: Date)`: Converts a `Date` object to `YYYYMMDDTHHmmssZ`.
- `getTomorrow()`: Returns tomorrow's date as `YYYY-MM-DD`.
- `escapeIcsText(text: string)`: Escapes special characters for iCalendar text fields.
- `incrementIcsDate(icsDate: string)`: Adds one day to a `YYYYMMDD` formatted date string, correctly handling month and year rollovers.
