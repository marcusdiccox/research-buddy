/** A calendar cell. Dates use local calendar notation, never UTC timestamps. */
export interface CalendarDay {
  date: string;
  day: number;
  inMonth: boolean;
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function calendarString(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function inYearRange(date: Date): boolean {
  return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999;
}

/** Rejects invalid dates and local times skipped by daylight-saving changes. */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const datePart = calendarDate(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!datePart || hour > 23 || minute > 59) return null;
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(datePart.getUTCFullYear(), datePart.getUTCMonth(), datePart.getUTCDate());
  date.setHours(hour, minute, 0, 0);
  return date.getFullYear() === datePart.getUTCFullYear() &&
    date.getMonth() === datePart.getUTCMonth() &&
    date.getDate() === datePart.getUTCDate() &&
    date.getHours() === hour &&
    date.getMinutes() === minute
    ? date
    : null;
}

export function toLocalDateTime(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999)
    return '';
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatLocalDateTime(value: string, locales?: string | string[]): string {
  const date = parseLocalDateTime(value);
  if (!date) return 'Choose date and time';
  return new Intl.DateTimeFormat(locales, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** Sunday-first complete weeks; between four and six rows per month. */
export function buildMonthGrid(month: string): CalendarDay[] {
  const first = calendarDate(`${month}-01`);
  if (!first) return [];
  const monthNumber = first.getUTCMonth();
  const last = new Date(first);
  last.setUTCMonth(monthNumber + 1, 0);
  const cellCount = Math.ceil((first.getUTCDay() + last.getUTCDate()) / 7) * 7;
  const cursor = new Date(first);
  cursor.setUTCDate(1 - first.getUTCDay());
  return Array.from({ length: cellCount }, () => {
    const cell = {
      date: calendarString(cursor),
      day: cursor.getUTCDate(),
      inMonth: cursor.getUTCMonth() === monthNumber,
    };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    return cell;
  });
}

/** Calendar-day arithmetic is independent of daylight-saving hour changes. */
export function shiftCalendarDate(value: string, days: number): string {
  const date = calendarDate(value);
  if (!date || !Number.isInteger(days)) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return inYearRange(date) ? calendarString(date) : value;
}

/** Month movement clamps January 31 to February's final day. */
export function shiftCalendarMonth(value: string, months: number): string {
  const date = calendarDate(value);
  if (!date || !Number.isInteger(months)) return value;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  if (!inYearRange(date)) return value;
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return calendarString(date);
}

/** Returns null for keys the calendar should leave to the browser. */
export function calendarKeyDate(value: string, key: string): string | null {
  const date = calendarDate(value);
  if (!date) return null;
  switch (key) {
    case 'ArrowLeft':
      return shiftCalendarDate(value, -1);
    case 'ArrowRight':
      return shiftCalendarDate(value, 1);
    case 'ArrowUp':
      return shiftCalendarDate(value, -7);
    case 'ArrowDown':
      return shiftCalendarDate(value, 7);
    case 'Home':
      return shiftCalendarDate(value, -date.getUTCDay());
    case 'End':
      return shiftCalendarDate(value, 6 - date.getUTCDay());
    case 'PageUp':
      return shiftCalendarMonth(value, -1);
    case 'PageDown':
      return shiftCalendarMonth(value, 1);
    default:
      return null;
  }
}
