import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuddyStore } from '../src/core/store';
import { CalendarSync } from '../src/core/calendar-sync';
import { nextRecurringDueAt } from '../src/core/recurrence';
import { parseLocalDateTime, toLocalDateTime } from '../src/core/date-time';
import type { Reminder, RepeatRule } from '../src/shared/contracts';

const originalTimeZone = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

function local(value: string): string {
  return parseLocalDateTime(value)!.toISOString();
}

describe('repeating reminder persistence', () => {
  it('advances the same SQLite reminder, resets delivered and pending alerts, and persists the next occurrence', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(local('2026-01-31T10:05')));
    const dir = mkdtempSync(join(tmpdir(), 'buddy-recurrence-'));
    const path = join(dir, 'reminders.sqlite');
    let db = new BuddyStore(path);
    try {
      const reminder = db.saveReminder({
        title: 'Review fictional garden log',
        dueAt: local('2026-01-31T10:00'),
        durationMinutes: 30,
        recurrence: 'monthly',
        calendarSync: true,
      });
      const [delivered] = db.takeReminderAlerts(local('2026-01-31T09:00'));
      db.finishReminderAlert(delivered, true);
      const [pending] = db.takeReminderAlerts(local('2026-01-31T09:30'));
      const next = db.completeReminder(reminder.id, true);
      expect(next.id).toBe(reminder.id);
      expect(next.completed).toBe(false);
      expect(next.dueAt).toBe(local('2026-02-28T10:00'));
      expect(next.recurrenceAnchorDay).toBe(31);
      expect(next.notifiedAt).toBeNull();
      expect(next.notificationAttemptAt).toBeNull();
      expect(next.notificationRetryAt).toBeNull();
      expect(next.notificationFailures).toBe(0);
      db.finishReminderAlert(pending, false);
      expect(db.getReminder(reminder.id).notificationError).toBe(false);
      expect(db.takeReminderAlerts(local('2026-01-31T10:05'))).toEqual([]);
      db.close();
      db = new BuddyStore(path);
      expect(db.snapshot().reminders).toHaveLength(1);
      expect(db.getReminder(reminder.id).dueAt).toBe(local('2026-02-28T10:00'));
      expect(db.takeReminderAlerts(local('2026-02-27T10:00'))[0].offsetMinutes).toBe(1440);
      vi.setSystemTime(new Date(local('2026-02-28T10:05')));
      expect(db.completeReminder(reminder.id, true).dueAt).toBe(local('2026-03-31T10:00'));
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves old missing rules and reminder opt-out, and validates schedule input', () => {
    const db = new BuddyStore(':memory:');
    try {
      const old = db.saveReminder({
        title: 'Legacy',
        dueAt: local('2026-01-31T10:00'),
        durationMinutes: 30,
      });
      expect(db.saveReminder({ ...old, title: 'Edited' }).recurrence).toBeUndefined();
      expect(db.completeReminder(old.id, true).completed).toBe(true);
      const repeating = db.saveReminder({
        ...old,
        id: undefined,
        recurrence: 'daily',
        remindEnabled: false,
      });
      const advanced = db.completeReminder(repeating.id, true);
      expect(advanced.completed).toBe(false);
      expect(advanced.remindEnabled).toBe(false);
      expect(db.takeReminderAlerts(advanced.dueAt)).toEqual([]);
      expect(() => db.saveReminder({ ...old, recurrence: 'yearly' as RepeatRule })).toThrow(
        /repeat/,
      );
      expect(() => db.saveReminder({ ...old, recurrenceAnchorDay: 32 })).toThrow(/repeat day/);
      expect(db.getReminder(old.id).recurrence).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('retains the monthly anchor for title edits and snooze, and resets it for an explicit date edit', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(local('2026-01-31T12:00')));
    const db = new BuddyStore(':memory:');
    try {
      const r = db.saveReminder({
        title: 'Water fictional plants',
        dueAt: local('2026-01-31T10:00'),
        durationMinutes: 30,
        recurrence: 'monthly',
      });
      const february = db.completeReminder(r.id, true);
      expect(db.saveReminder({ ...february, title: 'Updated title' }).recurrenceAnchorDay).toBe(31);
      const snoozed = db.snoozeReminder(r.id, local('2026-02-28T11:00'));
      expect(snoozed.recurrenceAnchorDay).toBe(31);
      vi.setSystemTime(new Date(local('2026-02-28T12:00')));
      expect(db.completeReminder(r.id, true).dueAt).toBe(local('2026-03-31T11:00'));
      const edited = db.saveReminder({ ...db.getReminder(r.id), dueAt: local('2026-03-15T09:00') });
      expect(edited.recurrenceAnchorDay).toBe(15);
      expect(db.completeReminder(r.id, false).dueAt).toBe(edited.dueAt);
    } finally {
      db.close();
    }
  });

  it('preserves the monthly anchor when an editor rounds snooze seconds or changes only the time', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(local('2026-01-31T12:00')));
    const db = new BuddyStore(':memory:');
    try {
      const r = db.saveReminder({
        title: 'Fictional garden log',
        dueAt: local('2026-01-31T10:00'),
        durationMinutes: 30,
        recurrence: 'monthly',
      });
      db.completeReminder(r.id, true);
      const snoozed = db.snoozeReminder(r.id, '2026-02-28T10:15:42.123-05:00');
      const edited = db.saveReminder({
        ...snoozed,
        title: 'Edited garden log',
        dueAt: local(toLocalDateTime(new Date(snoozed.dueAt))),
      });
      expect(edited.recurrenceAnchorDay).toBe(31);
      const timeChanged = db.saveReminder({ ...edited, dueAt: local('2026-02-28T00:15') });
      expect(timeChanged.recurrenceAnchorDay).toBe(31);
      vi.setSystemTime(new Date(local('2026-02-28T12:00')));
      expect(db.completeReminder(r.id, true).dueAt).toBe(local('2026-03-31T00:15'));
    } finally {
      db.close();
    }
  });

  it('keeps the linked Google event ID and uploads the advanced occurrence through the existing outbox', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
    const db = new BuddyStore(':memory:');
    const client = {
      connected: true,
      connect: vi.fn(async () => {}),
      cancelConnect: vi.fn(),
      disconnect: vi.fn(async () => {}),
      upsertReminder: vi.fn(async (_reminder: Reminder, _eventId?: string) => ({
        eventId: 'rb-fictional-garden',
      })),
    };
    try {
      const sync = new CalendarSync({
        store: db,
        load: () => ({ credentials: { clientId: 'fictional.apps.googleusercontent.com' } }),
        save: () => {},
        openExternal: async () => {},
        onChange: () => {},
        clientFactory: () => client,
      });
      const r = db.saveReminder({
        title: 'Fictional garden review',
        dueAt: '2026-01-31T10:00:00Z',
        durationMinutes: 30,
        recurrence: 'daily',
        calendarSync: true,
      });
      await sync.sync();
      const next = db.completeReminder(r.id, true);
      await sync.sync();
      expect(client.upsertReminder).toHaveBeenCalledTimes(2);
      expect(client.upsertReminder.mock.calls[1]).toEqual([next, 'rb-fictional-garden']);
      expect(db.calendarLinks()[0].id).toBe(r.id);
      expect(sync.status.pending).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('local recurrence boundaries', () => {
  it.each([
    ['daily', '2026-11-01T09:20', '2026-11-05T09:20', '2026-11-06T09:20'],
    ['daily', '2026-11-05T09:20', '2026-11-04T08:00', '2026-11-06T09:20'],
    ['weekdays', '2026-11-06T09:20', '2026-11-06T10:00', '2026-11-09T09:20'],
    ['weekdays', '2026-11-06T09:20', '2026-11-08T10:00', '2026-11-09T09:20'],
    ['weekly', '2026-10-01T09:20', '2026-11-05T09:19', '2026-11-05T09:20'],
    ['weekly', '2026-10-01T09:20', '2026-11-05T09:20', '2026-11-12T09:20'],
    ['monthly', '2024-01-31T09:20', '2024-02-01T09:20', '2024-02-29T09:20'],
    ['monthly', '2026-01-31T09:20', '2026-03-01T09:20', '2026-03-31T09:20'],
    ['daily', '0099-01-03T09:20', '2026-11-05T09:21', '2026-11-06T09:20'],
  ])('finds the first future %s occurrence from %s at %s', (rule, dueAt, now, expected) => {
    expect(
      toLocalDateTime(
        new Date(nextRecurringDueAt(local(dueAt), rule as RepeatRule, new Date(local(now)))),
      ),
    ).toBe(expected);
  });

  it.each([
    ['2026-03-07T09:20', '2026-03-08T09:20', 23],
    ['2026-10-31T09:20', '2026-11-01T09:20', 25],
  ])('preserves wall time across DST from %s', (dueAt, expected, elapsedHours) => {
    process.env.TZ = 'America/New_York';
    const result = nextRecurringDueAt(local(dueAt), 'daily', new Date(local(dueAt)));
    expect(toLocalDateTime(new Date(result))).toBe(expected);
    expect((Date.parse(result) - Date.parse(local(dueAt))) / 3600000).toBe(elapsedHours);
  });

  it('skips a nonexistent spring clock time and uses the earlier repeated autumn clock time', () => {
    process.env.TZ = 'America/New_York';
    expect(
      nextRecurringDueAt(local('2026-03-07T02:30'), 'daily', new Date(local('2026-03-07T02:30'))),
    ).toBe(local('2026-03-09T02:30'));
    expect(
      nextRecurringDueAt(local('2026-10-31T01:30'), 'daily', new Date(local('2026-10-31T01:30'))),
    ).toBe('2026-11-01T05:30:00.000Z');
  });

  it('rejects invalid rules and dates and the end of the supported calendar', () => {
    expect(() => nextRecurringDueAt('invalid', 'daily')).toThrow(/date/);
    expect(() => nextRecurringDueAt(local('2026-01-31T10:00'), 'none')).toThrow(/does not repeat/);
    expect(() => nextRecurringDueAt(local('2026-01-31T10:00'), 'yearly' as RepeatRule)).toThrow(
      /repeat/,
    );
    expect(() =>
      nextRecurringDueAt(local('9999-12-31T10:00'), 'daily', new Date(local('9999-12-31T10:00'))),
    ).toThrow(/calendar/);
  });
});
