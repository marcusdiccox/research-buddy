import type { BuddyStore } from './store.js';
import type { Reminder } from '../shared/contracts.js';
interface NativeNotice {
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
    const finish = (success: boolean) => {
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
