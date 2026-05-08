import { describe, it, expect } from 'vitest';
import {
  generateIcs,
  toIcsDate,
  toIcsTimestamp,
  incrementIcsDate,
  escapeIcsText,
  formatAlarmTrigger,
  foldLine,
  TodoWithTitle
} from './icsService';

describe('icsService', () => {
  const mockTodo: TodoWithTitle = {
    id: 'todo-123',
    conversationId: 'conversation-abc',
    conversationTitle: 'Test Conversation',
    text: 'Task with comma, and newline\nand backslash \\',
    priority: 'now',
    status: 'open',
    projectId: null,
    projectName: null,
    intent: 'GENERAL',
    createdAt: '2026-05-01T12:00:00Z',
    updatedAt: '2026-05-01T12:00:00Z',
    dueDate: '2026-05-08T00:00:00Z',
    snoozedUntil: null,
    sourceMessageHint: 'Hint here',
    calendarStatus: 'published',
    startTime: null,
    endTime: null,
    location: null,
    url: null,
    notes: null,
    alarms: [],
    recurrence: null,
    allDay: true,
  };

  describe('generateIcs', () => {
    it('returns a string starting with BEGIN:VCALENDAR', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).toContain('BEGIN:VCALENDAR');
    });

    it('returns a string ending with END:VCALENDAR\\r\\n', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    });

    it('includes UID with @holop.dev', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).toContain('UID:todo-123@holop.dev');
    });

    it('uses todo.dueDate as DTSTART when set', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).toContain('DTSTART;VALUE=DATE:20260508');
    });

    it('throws when all todos have no dueDate (even if published)', () => {
      const todoNoDate = { ...mockTodo, dueDate: null };
      expect(() => generateIcs([todoNoDate])).toThrow('No published todos to export');
    });

    it('sets DTEND as DTSTART + 1 day', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).toContain('DTEND;VALUE=DATE:20260509');
    });

    it('escapes text correctly in SUMMARY and DESCRIPTION', () => {
      const ics = generateIcs([mockTodo]);
      // text: 'Task with comma, and newline\nand backslash \\'
      expect(ics).toContain('SUMMARY:Task with comma\\, and newline\\nand backslash \\\\');
      expect(ics).toContain('DESCRIPTION:Source: "Test Conversation"\\nHint here');
    });

    it('includes one VEVENT per todo', () => {
      const ics = generateIcs([mockTodo, { ...mockTodo, id: 'todo-456' }]);
      const events = ics.match(/BEGIN:VEVENT/g);
      expect(events).toHaveLength(2);
    });

    it('throws an error if todos array is empty', () => {
      expect(() => generateIcs([])).toThrow('Cannot generate .ics with zero todos');
    });

    it('throws "No published todos to export" when all todos are pending', () => {
      const pending = { ...mockTodo, calendarStatus: 'pending' as const };
      expect(() => generateIcs([pending])).toThrow('No published todos to export');
    });

    it('excludes pending todos from output', () => {
      const pending = { ...mockTodo, id: 'todo-pending', calendarStatus: 'pending' as const };
      const ics = generateIcs([mockTodo, pending]);
      const events = ics.match(/BEGIN:VEVENT/g);
      expect(events).toHaveLength(1);
      expect(ics).toContain('UID:todo-123@holop.dev');
      expect(ics).not.toContain('UID:todo-pending@holop.dev');
    });

    it('excludes todos with no dueDate even if published', () => {
      const noDate = { ...mockTodo, dueDate: null };
      expect(() => generateIcs([noDate])).toThrow('No published todos to export');
    });

    it('produces DTSTART;VALUE=DATE for allDay events', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).toContain('DTSTART;VALUE=DATE:20260508');
      expect(ics).not.toContain('DTSTART;TZID');
    });

    it('produces DTSTART;TZID for timed events', () => {
      const timed = { ...mockTodo, allDay: false, startTime: '14:00' };
      const ics = generateIcs([timed]);
      expect(ics).toContain('DTSTART;TZID=');
      expect(ics).toContain('T140000');
    });

    it('defaults DTEND to startTime + 1 hour when endTime is not set', () => {
      const timed = { ...mockTodo, allDay: false, startTime: '14:00', endTime: null };
      const ics = generateIcs([timed]);
      expect(ics).toContain('T150000');
    });

    it('uses explicit endTime when set', () => {
      const timed = { ...mockTodo, allDay: false, startTime: '09:00', endTime: '10:30' };
      const ics = generateIcs([timed]);
      expect(ics).toContain('T103000');
    });

    it('includes VTIMEZONE block when any event has a time component', () => {
      const timed = { ...mockTodo, allDay: false, startTime: '10:00' };
      const ics = generateIcs([timed]);
      expect(ics).toContain('BEGIN:VTIMEZONE');
    });

    it('does not include VTIMEZONE when all events are all-day', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).not.toContain('BEGIN:VTIMEZONE');
    });

    it('includes alarm VALARM block', () => {
      const withAlarm: TodoWithTitle = {
        ...mockTodo,
        alarms: [{ id: 'a1', trigger: -15, action: 'DISPLAY', description: 'Reminder' }]
      };
      const ics = generateIcs([withAlarm]);
      expect(ics).toContain('BEGIN:VALARM');
      expect(ics).toContain('TRIGGER:-PT15M');
      expect(ics).toContain('ACTION:DISPLAY');
      expect(ics).toContain('END:VALARM');
    });

    it('includes multiple VALARM blocks for multiple alarms', () => {
      const withAlarms: TodoWithTitle = {
        ...mockTodo,
        alarms: [
          { id: 'a1', trigger: -15, action: 'DISPLAY', description: 'Reminder 1' },
          { id: 'a2', trigger: -60, action: 'EMAIL', description: 'Reminder 2' }
        ]
      };
      const ics = generateIcs([withAlarms]);
      const alarmBlocks = ics.match(/BEGIN:VALARM/g);
      expect(alarmBlocks).toHaveLength(2);
      expect(ics).toContain('ACTION:EMAIL');
    });

    it('includes RRULE for weekly recurrence', () => {
      const recurring: TodoWithTitle = {
        ...mockTodo,
        recurrence: { frequency: 'WEEKLY', interval: 1, until: null, count: null }
      };
      const ics = generateIcs([recurring]);
      expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1');
    });

    it('includes interval in RRULE', () => {
      const recurring: TodoWithTitle = {
        ...mockTodo,
        recurrence: { frequency: 'WEEKLY', interval: 2, until: null, count: null }
      };
      const ics = generateIcs([recurring]);
      expect(ics).toContain('INTERVAL=2');
    });

    it('includes UNTIL in RRULE when until is set', () => {
      const recurring: TodoWithTitle = {
        ...mockTodo,
        recurrence: { frequency: 'MONTHLY', interval: 1, until: '2027-01-01', count: null }
      };
      const ics = generateIcs([recurring]);
      expect(ics).toContain('UNTIL=20270101');
    });

    it('includes COUNT in RRULE when count is set', () => {
      const recurring: TodoWithTitle = {
        ...mockTodo,
        recurrence: { frequency: 'DAILY', interval: 1, until: null, count: 10 }
      };
      const ics = generateIcs([recurring]);
      expect(ics).toContain('COUNT=10');
    });

    it('does not include RRULE when recurrence is null', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).not.toContain('RRULE');
    });

    it('maps priority now to PRIORITY:1', () => {
      const ics = generateIcs([{ ...mockTodo, priority: 'now' }]);
      expect(ics).toContain('PRIORITY:1');
    });

    it('maps priority soon to PRIORITY:5', () => {
      const ics = generateIcs([{ ...mockTodo, priority: 'soon' }]);
      expect(ics).toContain('PRIORITY:5');
    });

    it('maps priority someday to PRIORITY:9', () => {
      const ics = generateIcs([{ ...mockTodo, priority: 'someday' }]);
      expect(ics).toContain('PRIORITY:9');
    });

    it('uses STATUS:NEEDS-ACTION', () => {
      const ics = generateIcs([mockTodo]);
      expect(ics).toContain('STATUS:NEEDS-ACTION');
    });
  });

  describe('helpers', () => {
    it('toIcsDate formats ISO string to YYYYMMDD', () => {
      expect(toIcsDate('2026-05-01T12:00:00Z')).toBe('20260501');
    });

    it('toIcsTimestamp formats Date object to YYYYMMDDTHHmmssZ', () => {
      const date = new Date('2026-05-01T18:00:00.000Z');
      expect(toIcsTimestamp(date)).toBe('20260501T180000Z');
    });

    it('incrementIcsDate handles year rollover', () => {
      expect(incrementIcsDate('20261231')).toBe('20270101');
    });

    it('incrementIcsDate handles month rollover', () => {
      expect(incrementIcsDate('20260131')).toBe('20260201');
    });

    it('escapeIcsText escapes special characters', () => {
      expect(escapeIcsText('hello, world; \n \\')).toBe('hello\\, world\\; \\n \\\\');
    });
  });

  describe('formatAlarmTrigger', () => {
    it('formats -15 as -PT15M', () => {
      expect(formatAlarmTrigger(-15)).toBe('-PT15M');
    });

    it('formats -60 as -PT1H', () => {
      expect(formatAlarmTrigger(-60)).toBe('-PT1H');
    });

    it('formats -90 as -PT1H30M', () => {
      expect(formatAlarmTrigger(-90)).toBe('-PT1H30M');
    });

    it('formats -1440 as -PT24H', () => {
      expect(formatAlarmTrigger(-1440)).toBe('-PT24H');
    });
  });

  describe('foldLine', () => {
    it('returns text unchanged when <= 75 chars', () => {
      const text = 'Short text';
      expect(foldLine(text)).toBe(text);
    });

    it('folds at 75 chars with CRLF+space continuation', () => {
      const text = 'A'.repeat(80);
      const folded = foldLine(text);
      const lines = folded.split('\r\n');
      expect(lines[0]).toHaveLength(75);
      expect(lines[1].startsWith(' ')).toBe(true);
    });

    it('returns exactly 75 chars unchanged', () => {
      const text = 'A'.repeat(75);
      expect(foldLine(text)).toBe(text);
    });
  });
});
