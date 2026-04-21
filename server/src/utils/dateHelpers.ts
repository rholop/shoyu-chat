/** Returns YYYY-MM-DD in UTC */
export function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns YYYY-WXX (ISO week, Monday-based) */
export function getISOWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Returns YYYY-MM */
export function getMonthKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** Returns the Monday–Sunday date range string for a given date */
export function getWeekRangeLabel(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `${fmt(monday)} – ${fmt(sunday)}, ${sunday.getFullYear()}`;
}

/** Returns full month name + year, e.g. "April 2026" */
export function getMonthLabel(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
