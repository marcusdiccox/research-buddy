import type { BuddyStore } from './store.js';
import type { Reminder, ReminderAlert } from '../shared/contracts.js';
export interface NativeNotice {
  once(event: string, callback: () => void): unknown;
  show(): void;
}
export function deliverDueReminders(
  store: BuddyStore,
  factory: (reminder: Reminder) => NativeNotice,
  now = new Date(),
  onChange: () => void = () => {},
) {
  const stamp = now.toISOString(),
    due = store.takeDueReminders(stamp);
  for (const reminder of due) {
    let finished = false;
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      store.finishNotification(reminder.id, stamp, success);
      onChange();
    };
    try {
      const notice = factory(reminder);
      notice.once('show', () => finish(true));
      notice.once('failed', () => finish(false));
      notice.show();
    } catch {
      finish(false);
    }
  }
  if (due.length) onChange();
}
export function deliverScheduledReminders(
  store: BuddyStore,
  factory: (alert: ReminderAlert) => NativeNotice,
  now = new Date(),
  onChange: () => void = () => {},
) {
  const alerts = store.takeReminderAlerts(now.toISOString());
  for (const alert of alerts) {
    let finished = false;
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      store.finishReminderAlert(alert, success);
      onChange();
    };
    try {
      const notice = factory(alert);
      notice.once('show', () => finish(true));
      notice.once('failed', () => finish(false));
      notice.show();
    } catch {
      finish(false);
    }
  }
  if (alerts.length) onChange();
}
