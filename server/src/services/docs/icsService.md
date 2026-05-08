# icsService

Generates RFC 5545 iCalendar (`.ics`) content from Todo objects for export and calendar subscription.

## Full VEVENT Field Coverage

Each `VEVENT` is generated with the following fields:

| iCal Field | Source | Notes |
|---|---|---|
| `UID` | `todo.id@holop.dev` | Stable across updates |
| `DTSTAMP` | Current UTC time | |
| `DTSTART` | `todo.dueDate` + `todo.startTime` | See Date/time handling below |
| `DTEND` | `todo.dueDate` + `todo.endTime` | See Date/time handling below |
| `SUMMARY` | `todo.text` | Folded at 75 octets, escaped |
| `DESCRIPTION` | `notes + title + sourceMessageHint` | Folded, escaped |
| `LOCATION` | `todo.location` | Only included if set |
| `URL` | `todo.url` | Only included if set |
| `PRIORITY` | Mapped from `todo.priority` | `now`=1, `soon`=5, `someday`=9 |
| `CATEGORIES` | `shoyu-chat,{priority}` | |
| `STATUS` | `NEEDS-ACTION` | |
| `RRULE` | `todo.recurrence` | Only included if `recurrence` is not null |
| `VALARM` block(s) | `todo.alarms` | One block per alarm |

## Filter: Published Todos Only

`generateIcs()` only includes todos where:
1. `calendarStatus === 'published'`
2. `dueDate` is not null

Throws `'No published todos to export'` if none qualify. Throws `'Cannot generate .ics with zero todos'` if the input array is empty.

## Date/Time Handling

### All-day events (`allDay: true` or `startTime: null`)

```
DTSTART;VALUE=DATE:YYYYMMDD
DTEND;VALUE=DATE:YYYYMMDD+1
```

No timezone component. The end date is start + 1 day (required by iCal spec for all-day events).

### Timed events (`allDay: false` and `startTime` is set)

```
DTSTART;TZID=America/New_York:YYYYMMDDTHHmmss
DTEND;TZID=America/New_York:YYYYMMDDTHHmmss
```

Timezone ID comes from `process.env.TZ` (defaults to `America/New_York`). If `endTime` is not set, `DTEND` defaults to `startTime + 1 hour`.

## VTIMEZONE

A minimal `BEGIN:VTIMEZONE ... END:VTIMEZONE` block is included in the calendar when any event has a time component (`!allDay && startTime`). Omitted when all events are all-day.

## Alarm Trigger Format (`formatAlarmTrigger`)

Alarm triggers are stored as negative integers (minutes before event). They are formatted as iCal `DURATION` values:

- `-15` → `-PT15M`
- `-60` → `-PT1H`
- `-90` → `-PT1H30M`
- `-1440` → `-PT24H`

## Line Folding (`foldLine`)

Per RFC 5545 §3.1, lines longer than 75 octets are folded with `CRLF + SPACE`:

```
SUMMARY:This is a very long summary that exceeds seventy-five octets and ne
 eds to be folded at the appropriate point
```

Applied to `SUMMARY` and `DESCRIPTION` fields.

## Recurrence (`RRULE`)

Generated from `todo.recurrence`:

```
RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231
```

- `until` and `count` are mutually exclusive in the rule
- If neither is set, the rule repeats indefinitely
