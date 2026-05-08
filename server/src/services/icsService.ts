import { Todo } from '../types';

export interface TodoWithTitle extends Todo {
  conversationTitle: string;
}

export function toIcsDate(isoString: string): string {
  // Convert ISO date string to YYYYMMDD for all-day events
  return isoString.slice(0, 10).replace(/-/g, '');
}

export function toIcsTimestamp(date: Date): string {
  // Convert Date to YYYYMMDDTHHmmssZ
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r/g, '')   // strip CR — a bare \r can inject iCal fields
    .replace(/\n/g, '\\n');
}

export function incrementIcsDate(icsDate: string): string {
  // icsDate is YYYYMMDD — add one day
  const year = parseInt(icsDate.slice(0, 4));
  const month = parseInt(icsDate.slice(4, 6)) - 1;
  const day = parseInt(icsDate.slice(6, 8));
  const d = new Date(year, month, day + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('');
}

export function generateIcs(todos: TodoWithTitle[]): string {
  if (todos.length === 0) {
    throw new Error('Cannot generate .ics with zero todos');
  }

  const now = toIcsTimestamp(new Date());
  const events = todos.map(todo => {
    const startDate = todo.dueDate
      ? toIcsDate(todo.dueDate)
      : toIcsDate(getTomorrow());
    // DTEND is start + 1 day for all-day events
    const endDate = incrementIcsDate(startDate);
    const summary = escapeIcsText(todo.text);
    const description = escapeIcsText(
      `Source: "${todo.conversationTitle}"\n${todo.sourceMessageHint}`
    );

    return [
      'BEGIN:VEVENT',
      `UID:${todo.id}@holop.dev`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `CATEGORIES:shoyu-chat,${todo.priority}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shoyu-chat//holop.dev//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n') + '\r\n'; // trailing CRLF required by spec
}
