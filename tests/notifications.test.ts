import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { BuddyStore } from '../src/core/store';
import { deliverDueReminders } from '../src/core/notifications';
it('retains failed notifications for a bounded retry and only acknowledges successful display', () => {
  const db = new BuddyStore(':memory:');
  const r = db.saveReminder({
    title: 'Review report',
    dueAt: '2026-11-03T14:00:00Z',
    durationMinutes: 30,
  });
  let fail = true;
  const factory = () => {
    const notification = new EventEmitter() as EventEmitter & { show: () => void };
    notification.show = () => notification.emit(fail ? 'failed' : 'show');
    return notification;
  };
  deliverDueReminders(db, factory, new Date('2026-11-03T14:00:00Z'));
  expect(db.getReminder(r.id).notifiedAt).toBeNull();
  expect(db.getReminder(r.id).notificationError).toBe(true);
  expect(db.takeDueReminders('2026-11-03T14:01:00Z')).toHaveLength(0);
  fail = false;
  deliverDueReminders(db, factory, new Date('2026-11-03T14:05:00Z'));
  expect(db.getReminder(r.id).notifiedAt).toBe('2026-11-03T14:05:00.000Z');
  expect(db.getReminder(r.id).notificationError).toBe(false);
  expect(db.takeDueReminders('2026-11-04T14:00:00Z')).toHaveLength(0);
  db.close();
});
it('recovers a notification reservation left behind by an interrupted process', () => {
  const db = new BuddyStore(':memory:');
  db.saveReminder({ title: 'Overdue', dueAt: '2026-11-03T14:00:00Z', durationMinutes: 30 });
  expect(db.takeDueReminders('2026-11-03T14:00:00Z')).toHaveLength(1);
  expect(db.takeDueReminders('2026-11-03T14:01:00Z')).toHaveLength(0);
  expect(db.takeDueReminders('2026-11-03T14:06:00Z')).toHaveLength(1);
  db.close();
});
