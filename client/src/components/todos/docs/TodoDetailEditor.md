# TodoDetailEditor

Full iCalendar-field editor for a single to-do. Opens as a slide-up sheet on mobile and a centered modal on desktop.

## Purpose

Exposes every iCal VEVENT field for editing: title, notes, location, URL, date/time, recurrence, alarms, priority, and status. Handles the publish/unpublish lifecycle by watching `dueDate` changes.

## Props

```typescript
interface TodoDetailEditorProps {
  todo: Todo;
  onClose: () => void;
  onSave: (updates: Partial<TodoUpdateFields>) => Promise<void>;
}
```

## Field Sections

### Event Details
- **Title** — `text`, required, max 120 chars
- **Notes** — `notes`, multi-line textarea, no max
- **Location** — `location`, free text
- **URL** — `url`, validated as URL on blur

### Date & Time
- **Date** — `dueDate` in YYYY-MM-DD format. Setting auto-publishes; clearing auto-unpublishes
- **All day** — `allDay` toggle; when off, Start time and End time become visible
- **Start time** — `startTime` in HH:MM (24hr), only when `allDay` is false
- **End time** — `endTime` in HH:MM (24hr), must be after start time, only when `allDay` is false

### Recurrence
- **Repeat** toggle — when off, `recurrence` is null
- **Frequency** — DAILY / WEEKLY / MONTHLY / YEARLY
- **Every N** — positive integer interval
- **End date** — `recurrence.until` (YYYY-MM-DD). Setting this clears `count`
- **End after N occurrences** — `recurrence.count`. Setting this clears `until`
- `until` and `count` are mutually exclusive — only one can be set at a time

### Reminders (Alarms)
- List of `TodoAlarm` items, each with trigger (minutes before, negative integer), action (DISPLAY or EMAIL), and description
- Trigger stored as negative integer (e.g. -15 = 15 minutes before)
- Displayed as human-readable string: "15 minutes before", "1 hour before", "1 day before"
- Quick presets: 15 min (-15), 30 min (-30), 1 hr (-60), 1 day (-1440)
- "Add reminder" appends new alarm with defaults: -15 minutes, DISPLAY action
- Delete button removes individual alarm

### Priority & Status
- **Priority** — segmented button group: Now / Soon / Someday
- **Status** — select: Open / Done / Snoozed
- **Calendar status** — read-only badge showing "Pending" or "Published". Never directly editable — derived from `dueDate`

## Publishing Behavior

- Setting `dueDate` to a non-null value → `calendarStatus` transitions from `pending` to `published` (handled server-side in `todoService.updateTodo`)
- Clearing `dueDate` → `calendarStatus` transitions from `published` to `pending`
- A note is shown in the footer when the user is about to publish or unpublish

## Save Behavior

- Only sends fields that changed from the original `todo` prop (diff-based patch)
- Does not auto-save on field change — waits for user to click Save
- Save button shows "Saving…" while `onSave` is pending
- Cancel discards all unsaved changes

## Layout

- **Mobile (< 768px)**: slide-up sheet, 90vh height, drag-handle at top, drag-down past 120px threshold closes
- **Desktop (≥ 768px)**: centered modal, max-width 560px, max-height 80vh
- Backdrop click closes on both
- Escape key closes on desktop

## Alarm Trigger Format

Stored as a negative integer (minutes before event):
- `-15` → 15 minutes before
- `-60` → 1 hour before
- `-90` → 1 hour 30 minutes before
- `-1440` → 1 day before
