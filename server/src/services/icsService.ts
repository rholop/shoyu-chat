import { Todo } from '../types';

export interface TodoWithTitle extends Todo {
  conversationTitle: string;
}

export function toIcsDate(isoString: string): string {
  return isoString.slice(0, 10).replace(/-/g, '');
}

export function toIcsTimestamp(date: Date): string {
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
    .replace(/\r/g, '')
    .replace(/\n/g, '\\n');
}

export function incrementIcsDate(icsDate: string): string {
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

export function formatAlarmTrigger(minutes: number): string {
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? '-' : '';
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours > 0 && mins > 0) return `${sign}PT${hours}H${mins}M`;
  if (hours > 0) return `${sign}PT${hours}H`;
  return `${sign}PT${mins}M`;
}

export function foldLine(text: string): string {
  if (text.length <= 75) return text;
  const result: string[] = [];
  let remaining = text;
  result.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    result.push(' ' + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return result.join('\r\n');
}

export function addOneHour(dt: string): string {
  const year = parseInt(dt.slice(0, 4));
  const month = parseInt(dt.slice(4, 6)) - 1;
  const day = parseInt(dt.slice(6, 8));
  const hour = parseInt(dt.slice(9, 11));
  const min = parseInt(dt.slice(11, 13));
  const d = new Date(year, month, day, hour + 1, min);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    'T',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    '00'
  ].join('');
}

export function buildVTimezone(tzid: string): string {
  return `BEGIN:VTIMEZONE\r\nTZID:${tzid}\r\nEND:VTIMEZONE`;
}

export function generateIcs(todos: TodoWithTitle[]): string {
  if (todos.length === 0) {
    throw new Error('Cannot generate .ics with zero todos');
  }

  const published = todos.filter(t => t.calendarStatus === 'published' && t.dueDate);
  if (published.length === 0) {
    throw new Error('No published todos to export');
  }

  const now = toIcsTimestamp(new Date());
  const tzid = process.env.TZ || 'America/New_York';

  const events = published.map(todo => {
    const lines: string[] = ['BEGIN:VEVENT'];
    lines.push(`UID:${todo.id}@holop.dev`);
    lines.push(`DTSTAMP:${now}`);

    if (todo.allDay || !todo.startTime) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(todo.dueDate!)}`);
      lines.push(`DTEND;VALUE=DATE:${incrementIcsDate(toIcsDate(todo.dueDate!))}`);
    } else {
      const dateStr = toIcsDate(todo.dueDate!);
      const startDt = `${dateStr}T${todo.startTime!.replace(':', '')}00`;
      lines.push(`DTSTART;TZID=${tzid}:${startDt}`);
      if (todo.endTime) {
        const endDt = `${dateStr}T${todo.endTime.replace(':', '')}00`;
        lines.push(`DTEND;TZID=${tzid}:${endDt}`);
      } else {
        lines.push(`DTEND;TZID=${tzid}:${addOneHour(startDt)}`);
      }
    }

    lines.push(`SUMMARY:${foldLine(escapeIcsText(todo.text))}`);

    const descParts = [
      todo.notes,
      `Source: "${todo.conversationTitle}"`,
      todo.sourceMessageHint,
    ].filter(Boolean);
    lines.push(`DESCRIPTION:${foldLine(escapeIcsText(descParts.join('\n')))}`);

    if (todo.location) {
      lines.push(`LOCATION:${foldLine(escapeIcsText(todo.location))}`);
    }
    if (todo.url) {
      lines.push(`URL:${todo.url}`);
    }

    const priorityMap: Record<string, number> = { now: 1, soon: 5, someday: 9 };
    lines.push(`PRIORITY:${priorityMap[todo.priority]}`);
    lines.push(`CATEGORIES:shoyu-chat,${todo.priority}`);
    lines.push('STATUS:NEEDS-ACTION');

    if (todo.recurrence) {
      let rrule = `RRULE:FREQ=${todo.recurrence.frequency};INTERVAL=${todo.recurrence.interval}`;
      if (todo.recurrence.until) {
        rrule += `;UNTIL=${toIcsDate(todo.recurrence.until)}`;
      } else if (todo.recurrence.count) {
        rrule += `;COUNT=${todo.recurrence.count}`;
      }
      lines.push(rrule);
    }

    for (const alarm of todo.alarms) {
      lines.push('BEGIN:VALARM');
      lines.push(`TRIGGER:${formatAlarmTrigger(alarm.trigger)}`);
      lines.push(`ACTION:${alarm.action}`);
      lines.push(`DESCRIPTION:${escapeIcsText(alarm.description || todo.text)}`);
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
    return lines.join('\r\n');
  });

  const hasTimed = published.some(t => !t.allDay && t.startTime);
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shoyu-chat//holop.dev//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(hasTimed ? [buildVTimezone(tzid)] : [])
  ];

  return [...header, ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
