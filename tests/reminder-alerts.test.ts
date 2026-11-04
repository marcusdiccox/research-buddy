import { afterEach, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BuddyStore } from '../src/core/store';
import { deliverScheduledReminders } from '../src/core/notifications';
import { formatReminderAlert } from '../src/core/reminder-policy';
import type { ReminderDraft } from '../src/shared/contracts';

const stores: BuddyStore[] = [];
const folders: string[] = [];
function open(path = ':memory:') {
  const store = new BuddyStore(path);
  stores.push(store);
  return store;
}
function close(store: BuddyStore) {
  stores.splice(stores.indexOf(store), 1);
  store.close();
}
afterEach(() => {
  stores.splice(0).forEach((store) => store.close());
  folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});
const draft: ReminderDraft = {
  title: 'Review earnings',
  dueAt: '2026-11-05T14:00:00Z',
  durationMinutes: 30,
};

it('delivers exactly five fixed checkpoints with no sixth alert at the event', () => {
  const store = open();
  store.saveReminder(draft);
  expect(store.takeReminderAlerts('2026-11-04T13:59:59Z')).toEqual([]);
  for (const [time, offset] of [
    ['2026-11-04T14:00:00Z', 1440],
    ['2026-11-05T08:00:00Z', 360],
    ['2026-11-05T12:00:00Z', 120],
    ['2026-11-05T13:00:00Z', 60],
    ['2026-11-05T13:30:00Z', 30],
  ] as const) {
    const alerts = store.takeReminderAlerts(time);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].offsetMinutes).toBe(offset);
    expect(alerts[0].scheduledAt).toBe(new Date(time).toISOString());
    store.finishReminderAlert(alerts[0], true);
    expect(store.takeReminderAlerts(time)).toEqual([]);
  }
  expect(store.takeReminderAlerts('2026-11-05T14:00:00Z')).toEqual([]);
  expect(store.takeReminderAlerts('2026-11-06T14:00:00Z')).toEqual([]);
});

it('coalesces missed checkpoints to the latest elapsed stage and keeps future stages', () => {
  const store = open();
  store.saveReminder(draft);
  const [alert] = store.takeReminderAlerts('2026-11-05T12:15:00Z');
  expect(alert.offsetMinutes).toBe(120);
  store.finishReminderAlert(alert, true);
  expect(store.takeReminderAlerts('2026-11-05T12:59:59Z')).toEqual([]);
  expect(store.takeReminderAlerts('2026-11-05T13:00:00Z')[0].offsetMinutes).toBe(60);
});

it.each(['2026-11-05T13:45:00Z', '2026-11-06T13:45:00Z'])(
  'issues only one final catchup when first checked at %s',
  (time) => {
    const store = open();
    store.saveReminder(draft);
    const alerts = store.takeReminderAlerts(time);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].offsetMinutes).toBe(30);
    store.finishReminderAlert(alerts[0], true);
    expect(store.takeReminderAlerts('2026-11-07T14:00:00Z')).toEqual([]);
  },
);

it('persists checkpoint acknowledgements, retry delays and interrupted reservations across restart', () => {
  const folder = mkdtempSync(join(tmpdir(), 'buddy-alerts-'));
  folders.push(folder);
  const path = join(folder, 'alerts.sqlite');
  let store = open(path);
  store.saveReminder(draft);
  const [day] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.finishReminderAlert(day, true);
  close(store);
  store = open(path);
  expect(store.takeReminderAlerts('2026-11-04T14:10:00Z')).toEqual([]);
  const [six] = store.takeReminderAlerts('2026-11-05T08:00:00Z');
  store.finishReminderAlert(six, false);
  close(store);
  store = open(path);
  expect(store.takeReminderAlerts('2026-11-05T08:04:59Z')).toEqual([]);
  expect(store.takeReminderAlerts('2026-11-05T08:05:00Z')).toHaveLength(1);
  close(store);
  store = open(path);
  expect(store.takeReminderAlerts('2026-11-05T08:09:59Z')).toEqual([]);
  const [recovered] = store.takeReminderAlerts('2026-11-05T08:10:00Z');
  expect(recovered.offsetMinutes).toBe(360);
  store.finishReminderAlert(recovered, true);
  expect(store.takeReminderAlerts('2026-11-05T08:20:00Z')).toEqual([]);
});

it('defaults reminders to enabled, validates switches and ignores completed or disabled reminders', () => {
  const store = open();
  expect(store.saveReminder(draft).remindEnabled).toBe(true);
  const disabled = store.saveReminder({ ...draft, remindEnabled: false });
  const completed = store.saveReminder(draft);
  store.completeReminder(completed.id, true);
  expect(store.takeReminderAlerts('2026-11-05T14:00:00Z')).toHaveLength(1);
  expect(store.getReminder(disabled.id).remindEnabled).toBe(false);
  expect(() =>
    store.saveReminder({ ...draft, remindEnabled: 'yes' as unknown as boolean }),
  ).toThrow();
  expect(store.settings().bubblePinned).toBe(false);
  expect(store.saveSettings({ bubblePinned: true }).bubblePinned).toBe(true);
  expect(store.saveSettings({ bubblePinned: 'no' as unknown as boolean }).bubblePinned).toBe(true);
});

it('preserves delivered stages through content edits and resets them for a changed due time', () => {
  const store = open();
  const reminder = store.saveReminder(draft);
  const [first] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.finishReminderAlert(first, true);
  store.saveReminder({
    ...reminder,
    title: 'Edited title',
    details: 'Edited notes',
    durationMinutes: 60,
  });
  expect(store.takeReminderAlerts('2026-11-04T14:30:00Z')).toEqual([]);
  expect(store.getReminder(reminder.id).title).toBe('Edited title');
  store.saveReminder({ ...reminder, dueAt: '2026-11-04T15:00:00Z' });
  const [changed] = store.takeReminderAlerts('2026-11-04T14:30:00Z');
  expect(changed.offsetMinutes).toBe(30);
  store.finishReminderAlert(first, true);
  store.finishReminderAlert(changed, true);
  expect(store.takeReminderAlerts('2026-11-04T15:00:00Z')).toEqual([]);
});

it('ignores stale acknowledgements across due-time edits including changing back', () => {
  const store = open();
  const reminder = store.saveReminder(draft);
  const [stale] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.saveReminder({ ...reminder, dueAt: '2026-11-06T14:00:00Z' });
  store.saveReminder(reminder);
  const [fresh] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  expect(fresh.attemptAt).not.toBe(stale.attemptAt);
  store.finishReminderAlert(stale, true);
  store.finishReminderAlert(fresh, false);
  expect(store.takeReminderAlerts('2026-11-04T14:04:59Z')).toEqual([]);
  expect(store.takeReminderAlerts('2026-11-04T14:05:01Z')).toHaveLength(1);
});

it('cancels reservations while disabled and preserves successful stages when re-enabled', () => {
  const store = open();
  const reminder = store.saveReminder(draft);
  const [stale] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.saveReminder({ ...reminder, remindEnabled: false });
  expect(store.takeReminderAlerts('2026-11-04T14:00:00Z')).toEqual([]);
  store.saveReminder({ ...reminder, remindEnabled: true });
  const [fresh] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.finishReminderAlert(stale, false);
  store.finishReminderAlert(fresh, true);
  store.saveReminder({ ...reminder, remindEnabled: false });
  store.saveReminder({ ...reminder, remindEnabled: true });
  expect(store.takeReminderAlerts('2026-11-04T14:30:00Z')).toEqual([]);
});

it('advances to a newer checkpoint instead of retrying obsolete missed alerts', () => {
  const store = open();
  store.saveReminder(draft);
  const [day] = store.takeReminderAlerts('2026-11-05T07:59:00Z');
  store.finishReminderAlert(day, false);
  const [six] = store.takeReminderAlerts('2026-11-05T08:00:00Z');
  expect(six.offsetMinutes).toBe(360);
  store.finishReminderAlert(day, true);
  store.finishReminderAlert(six, true);
  expect(store.takeReminderAlerts('2026-11-05T08:10:00Z')).toEqual([]);
});

it('does not resend legacy past events that were already displayed', () => {
  const folder = mkdtempSync(join(tmpdir(), 'buddy-legacy-alerts-'));
  folders.push(folder);
  const path = join(folder, 'alerts.sqlite');
  let store = open(path);
  const sent = store.saveReminder(draft);
  const unsent = store.saveReminder({ ...draft, title: 'Legacy unsent' });
  close(store);
  const sqlite = new DatabaseSync(path);
  for (const reminder of [sent, unsent]) {
    delete reminder.remindEnabled;
    reminder.notifiedAt = reminder.id === sent.id ? '2026-11-05T14:00:00Z' : null;
    sqlite
      .prepare('UPDATE records SET value=? WHERE kind=? AND id=?')
      .run(JSON.stringify(reminder), 'reminder', reminder.id);
  }
  sqlite.close();
  store = open(path);
  expect(
    store.takeReminderAlerts('2026-11-06T14:00:00Z').map((alert) => alert.reminder.id),
  ).toEqual([unsent.id]);
});

it('acknowledges display only once even if native notifications emit contradictory events', () => {
  const store = open();
  const reminder = store.saveReminder(draft);
  deliverScheduledReminders(
    store,
    (alert) => {
      expect(alert.reminder.id).toBe(reminder.id);
      const notice = new EventEmitter() as EventEmitter & { show(): void };
      notice.show = () => {
        notice.emit('show');
        notice.emit('failed');
      };
      return notice;
    },
    new Date('2026-11-04T14:00:00Z'),
  );
  expect(store.getReminder(reminder.id).notificationError).toBe(false);
  expect(store.takeReminderAlerts('2026-11-04T14:10:00Z')).toEqual([]);
});

it('retries factory exceptions with bounded exponential delays', () => {
  const store = open();
  store.saveReminder(draft);
  deliverScheduledReminders(
    store,
    () => {
      throw new Error('No native display');
    },
    new Date('2026-11-05T14:00:00Z'),
  );
  for (const [before, retry] of [
    ['14:04:59', '14:05:00'],
    ['14:14:59', '14:15:00'],
    ['14:34:59', '14:35:00'],
    ['15:14:59', '15:15:00'],
    ['16:14:59', '16:15:00'],
    ['17:14:59', '17:15:00'],
  ]) {
    expect(store.takeReminderAlerts(`2026-11-05T${before}Z`)).toEqual([]);
    const alerts = store.takeReminderAlerts(`2026-11-05T${retry}Z`);
    expect(alerts).toHaveLength(1);
    store.finishReminderAlert(alerts[0], false);
  }
});

it('ignores a pending callback after completion and recovers when reopened', () => {
  const store = open();
  const reminder = store.saveReminder(draft);
  const [stale] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.completeReminder(reminder.id, true);
  store.finishReminderAlert(stale, true);
  expect(store.getReminder(reminder.id).notifiedAt).toBeNull();
  store.completeReminder(reminder.id, false);
  const [fresh] = store.takeReminderAlerts('2026-11-04T14:00:00Z');
  store.finishReminderAlert(stale, true);
  store.finishReminderAlert(fresh, true);
  expect(store.takeReminderAlerts('2026-11-04T14:10:00Z')).toEqual([]);
});

it('uses actual time remaining for late checkpoint messages and bounds long Unicode titles', () => {
  const store = open();
  store.saveReminder(draft);
  const [alert] = store.takeReminderAlerts('2026-11-05T12:15:00Z');
  expect(formatReminderAlert(alert, new Date('2026-11-05T12:15:00Z'))).toBe(
    'Review earnings is due in 1 hour 45 minutes.',
  );
  expect(formatReminderAlert(alert, new Date('2026-11-05T14:05:00Z'))).toBe(
    'Review earnings was due 5 minutes ago.',
  );
  expect(formatReminderAlert(alert, new Date('2026-11-05T14:00:00Z'))).toBe(
    'Review earnings is due now.',
  );
  expect(formatReminderAlert(alert, new Date('2026-11-05T13:59:30Z'))).toBe(
    'Review earnings is due in less than a minute.',
  );
  alert.reminder.title = '🦊'.repeat(200);
  const message = formatReminderAlert(alert, new Date('2026-11-05T12:15:00Z'));
  expect([...message].length).toBeLessThan(140);
  expect(message).toContain('… is due in 1 hour 45 minutes.');
  expect(message).not.toContain('\uFFFD');
});
