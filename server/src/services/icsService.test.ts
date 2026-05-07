import { describe, it, expect } from 'vitest';
import {
  generateIcs,
  toIcsDate,
  toIcsTimestamp,
  incrementIcsDate,
  escapeIcsText,
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
    sourceMessageHint: 'Hint here'
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

    it('uses tomorrow as DTSTART when dueDate is null', () => {
      const todoNoDate = { ...mockTodo, dueDate: null };
      const ics = generateIcs([todoNoDate]);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expectedDate = tomorrow.toISOString().slice(0, 10).replace(/-/g, '');
      expect(ics).toContain(`DTSTART;VALUE=DATE:${expectedDate}`);
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
});
