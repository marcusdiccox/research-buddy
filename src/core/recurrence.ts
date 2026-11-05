import type { RepeatRule } from '../shared/contracts.js';

const repeatRules: readonly RepeatRule[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

export function validRepeatRule(value: unknown): RepeatRule {
  if (typeof value !== 'string' || !repeatRules.includes(value as RepeatRule))
    throw new Error('Choose an available repeat schedule.');
  return value as RepeatRule;
}

export function validRecurrenceAnchorDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 31)
    throw new Error('Choose a repeat day between 1 and 31.');
  return value;
}

function calendarDay(date: Date): number {
  const day = new Date(0);
  day.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime() / 86400000;
}

/**
 * Advances a local schedule, skipping missed occurrences without iterating them.
 * Missing DST wall times are skipped; repeated times use the earlier occurrence,
 * matching JavaScript's local date construction and the date picker's choices.
 */
export function nextRecurringDueAt(
  dueAt: string,
  rule: RepeatRule,
  now = new Date(),
  anchorDay?: number,
): string {
  const repeat = validRepeatRule(rule);
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime()) || !Number.isFinite(now.getTime()))
    throw new Error('Choose a valid repeat date and time.');
  if (repeat === 'none') throw new Error('This reminder does not repeat.');
  const anchor = validRecurrenceAnchorDay(anchorDay ?? due.getDate());
  const threshold = Math.max(due.getTime(), now.getTime());
  const daysElapsed = calendarDay(now) - calendarDay(due);
  let step =
    repeat === 'monthly'
      ? Math.max(1, (now.getFullYear() - due.getFullYear()) * 12 + now.getMonth() - due.getMonth())
      : Math.max(1, Math.floor(daysElapsed / (repeat === 'weekly' ? 7 : 1)));

  // Starting near today's calendar date bounds this loop independently of how
  // ancient the saved occurrence is. Extra steps only skip weekends/DST gaps.
  for (;;) {
    const date = new Date(0);
    date.setUTCHours(12, 0, 0, 0);
    if (repeat === 'monthly') {
      date.setUTCFullYear(due.getFullYear(), due.getMonth() + step + 1, 0);
      date.setUTCDate(Math.min(anchor, date.getUTCDate()));
    } else {
      date.setUTCFullYear(
        due.getFullYear(),
        due.getMonth(),
        due.getDate() + step * (repeat === 'weekly' ? 7 : 1),
      );
    }
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
      throw new Error('The next repeat is outside the supported calendar.');
    const candidate = new Date(2000, 0, 1, 12);
    candidate.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    candidate.setHours(due.getHours(), due.getMinutes(), due.getSeconds(), due.getMilliseconds());
    const matchesLocalTime =
      candidate.getFullYear() === date.getUTCFullYear() &&
      candidate.getMonth() === date.getUTCMonth() &&
      candidate.getDate() === date.getUTCDate() &&
      candidate.getHours() === due.getHours() &&
      candidate.getMinutes() === due.getMinutes();
    if (
      matchesLocalTime &&
      candidate.getTime() > threshold &&
      (repeat !== 'weekdays' || (candidate.getDay() !== 0 && candidate.getDay() !== 6))
    )
      return candidate.toISOString();
    step += 1;
  }
}
