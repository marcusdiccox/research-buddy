import { parseLocalDateTime, toLocalDateTime } from './date-time.js';

export type NaturalDateResult = { ok: true; value: string } | { ok: false; error: string };

export interface NaturalDateOptions {
  /** The reference clock, supplied explicitly to make previews and tests deterministic. */
  now: Date;
  /** HH:mm used by date-only phrases; defaults to the reference clock's local time. */
  defaultTime?: string;
}

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const unsupported =
  'Try “tomorrow at 3pm”, “Friday at 09:00”, “in 30 minutes”, or “2027-02-03 14:00”.';
const failure = (error: string): NaturalDateResult => ({ ok: false, error });

function readTime(text: string): string | null {
  const clock = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
  if (clock) {
    const hour = Number(clock[1]);
    const minute = Number(clock[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return `${String((hour % 12) + (clock[3] === 'pm' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const military = /^(\d{2}):(\d{2})$/.exec(text);
  return military && Number(military[1]) < 24 && Number(military[2]) < 60 ? text : null;
}

function calendarOffset(date: string, days: number): string | null {
  // UTC is used only for calendar arithmetic, never to interpret a local clock.
  const cursor = new Date(`${date}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  const year = cursor.getUTCFullYear();
  if (!Number.isFinite(cursor.getTime()) || year < 1 || year > 9999) return null;
  return cursor.toISOString().slice(0, 10);
}

function isRepeatedLocalTime(date: Date, value: string): boolean {
  // A nearby offset change may give this same wall-clock time two instants.
  // Include two days either side to cover half-hour and date-line transitions.
  for (const days of [-2, -1, 1, 2]) {
    const nearbyOffset = new Date(date.getTime() + days * 86_400_000).getTimezoneOffset();
    const difference = nearbyOffset - date.getTimezoneOffset();
    if (difference && toLocalDateTime(new Date(date.getTime() + difference * 60_000)) === value)
      return true;
  }
  return false;
}

/**
 * Small, local English grammar. Bare weekdays choose their next future occurrence;
 * “next weekday” chooses the following Monday–Sunday week. Days/weeks preserve
 * defaultTime; minutes/hours are elapsed durations. No locale/date guessing occurs.
 */
export function parseNaturalDate(text: string, options: NaturalDateOptions): NaturalDateResult {
  const { now } = options;
  const localNow = toLocalDateTime(now);
  if (!localNow) return failure('The current clock is invalid. Choose a date using the calendar.');
  const input = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const defaultTime = options.defaultTime ?? localNow.slice(11);
  let value: string;

  const relative = /^in\s*(\d+)\s*(minutes?|hours?|days?|weeks?)$/.exec(input);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isSafeInteger(amount) || amount < 1)
      return failure('Use a positive whole number, such as “in 30 minutes” or “in 2 days”.');
    const unit = relative[2];
    if (unit.startsWith('minute') || unit.startsWith('hour')) {
      value = toLocalDateTime(
        new Date(now.getTime() + amount * (unit.startsWith('hour') ? 3_600_000 : 60_000)),
      );
    } else {
      if (!/^\d{2}:\d{2}$/.test(defaultTime) || !readTime(defaultTime))
        return failure('Choose a valid time first, or include a time such as “at 3pm”.');
      const date = calendarOffset(
        localNow.slice(0, 10),
        amount * (unit.startsWith('week') ? 7 : 1),
      );
      value = date ? `${date}T${defaultTime}` : '';
    }
  } else {
    const explicit = /^(\d{4}-\d{2}-\d{2})(?:(?: at\s*|t| )(.+))?$/.exec(input);
    const named =
      /^(today|tomorrow|(?:next )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))(?: at\s*(.+))?$/.exec(
        input,
      );
    if (!explicit && !named) return failure(unsupported);
    const timeText = explicit?.[2] ?? named?.[2];
    const time = timeText ? readTime(timeText) : readTime(defaultTime);
    if (!time) return failure('Use am or pm, such as “3pm”, or a 24-hour time such as “15:00”.');
    let date = explicit?.[1] ?? localNow.slice(0, 10);
    if (named) {
      const phrase = named[1];
      if (phrase === 'tomorrow') date = calendarOffset(date, 1) ?? '';
      else if (phrase !== 'today') {
        const nextWeek = phrase.startsWith('next ');
        const day = weekdays.indexOf(phrase.replace(/^next /, ''));
        const currentDay = now.getDay();
        let offset = nextWeek
          ? 7 - ((currentDay + 6) % 7) + ((day + 6) % 7)
          : (day - currentDay + 7) % 7;
        if (!nextWeek && offset === 0) {
          const sameDay = parseLocalDateTime(`${date}T${time}`);
          if (sameDay && sameDay.getTime() <= now.getTime()) offset = 7;
        }
        date = calendarOffset(date, offset) ?? '';
      }
    }
    value = date ? `${date}T${time}` : '';
  }

  const parsed = parseLocalDateTime(value);
  if (!parsed)
    return failure(
      'That date or time is invalid or skipped by a clock change. Choose another local time (years 0001–9999).',
    );
  if (isRepeatedLocalTime(parsed, value))
    return failure(
      'That local time occurs twice during a clock change. Choose a time outside the repeated hour.',
    );
  if (parsed.getTime() <= now.getTime())
    return failure('Choose a future date and time. That time has already passed.');
  return { ok: true, value };
}
