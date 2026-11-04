import type { ReminderAlert } from '../shared/contracts.js';

/** The five fixed checkpoints, ordered from earliest to latest. */
export const REMINDER_LEAD_MINUTES = [1440, 360, 120, 60, 30] as const;

/** Short companion text uses the actual event time, including delayed delivery. */
export function formatReminderAlert(alert: ReminderAlert, now = new Date()): string {
  const characters = [...alert.reminder.title.replace(/\s+/g, ' ').trim()];
  const title =
    characters.length > 72 ? `${characters.slice(0, 71).join('')}…` : characters.join('');
  const remaining = Date.parse(alert.reminder.dueAt) - now.getTime();
  if (remaining === 0) return `${title} is due now.`;
  const minutes = Math.ceil(Math.abs(remaining) / 60000);
  let duration = 'less than a minute';
  if (Math.abs(remaining) >= 60000) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    duration = [
      [days, 'day'],
      [hours, 'hour'],
      [rest, 'minute'],
    ]
      .filter(([amount]) => amount !== 0)
      .map(([amount, unit]) => `${amount} ${unit}${amount === 1 ? '' : 's'}`)
      .join(' ');
  }
  return remaining > 0 ? `${title} is due in ${duration}.` : `${title} was due ${duration} ago.`;
}
