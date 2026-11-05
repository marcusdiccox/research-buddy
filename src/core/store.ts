import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { defaultPetPreferences } from './pet.js';
import { REMINDER_LEAD_MINUTES } from './reminder-policy.js';
import { nextRecurringDueAt, validRecurrenceAnchorDay, validRepeatRule } from './recurrence.js';
import type {
  Project,
  Note,
  NoteDraft,
  Reminder,
  ReminderDraft,
  ReminderAlert,
  JournalEntry,
  JournalDraft,
  ResearchResult,
  Snapshot,
  Settings,
  CalendarLink,
  LibraryGroup,
  LibraryItemRef,
  LibraryItemState,
} from '../shared/contracts.js';

const defaults: Settings = {
  ...defaultPetPreferences,
  petVisible: true,
  alwaysOnTop: true,
  notifications: true,
  providerConsent: false,
  bubblePinned: false,
};
interface CheckpointState {
  settled?: boolean;
  attemptAt?: string;
  retryAt?: string;
  failures?: number;
}
interface ReminderSchedule {
  id: string;
  dueAt: string;
  lastAttemptAt?: string;
  stages: Partial<Record<ReminderAlert['offsetMinutes'], CheckpointState>>;
}
export function text(value: unknown, label: string, max = 200, optional = false): string {
  if (typeof value !== 'string' || (!optional && !value.trim()) || [...value].length > max)
    throw new Error(
      `${label} ${optional ? 'is too long or invalid' : 'is required and must fit the limit'}.`,
    );
  return value.trim();
}
export function validDate(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('Choose a valid date and time.');
  return new Date(value).toISOString();
}
export class BuddyStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, project_id TEXT NOT NULL DEFAULT '', value TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE VIRTUAL TABLE IF NOT EXISTS note_search USING fts5(id UNINDEXED, project_id UNINDEXED, title, body);
      PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  private all<T>(kind: string, includeTrashed = false): T[] {
    const items = (
      this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid DESC').all(kind) as {
        value: string;
      }[]
    ).map((r) => JSON.parse(r.value) as T);
    if (includeTrashed || !['note', 'reminder'].includes(kind)) return items;
    const deleted = new Set(
      this.all<LibraryItemState>('library-item')
        .filter((item) => item.kind === kind && item.deletedAt)
        .map((item) => item.itemId),
    );
    return items.filter((item) => !deleted.has((item as { id: string }).id));
  }
  private isTrashed(kind: string, id: string) {
    if (!['note', 'reminder'].includes(kind)) return false;
    const row = this.db
      .prepare('SELECT value FROM records WHERE kind=? AND id=?')
      .get('library-item', `${kind}:${id}`) as { value: string } | undefined;
    return !!row && !!(JSON.parse(row.value) as LibraryItemState).deletedAt;
  }
  private put<T extends { id: string; projectId?: string }>(kind: string, item: T) {
    this.db
      .prepare('INSERT OR REPLACE INTO records(kind,id,project_id,value) VALUES(?,?,?,?)')
      .run(kind, item.id, item.projectId ?? '', JSON.stringify(item));
  }
  private get<T>(kind: string, id: string, includeTrashed = false): T {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id) as
      { value: string } | undefined;
    if (!row) throw new Error('That item could not be found.');
    if (!includeTrashed && this.isTrashed(kind, id))
      throw new Error('That item is in Trash. Restore it from Saved.');
    return JSON.parse(row.value) as T;
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  snapshot(): Snapshot {
    const libraryItems = this.all<LibraryItemState>('library-item');
    const deleted = new Set(libraryItems.filter((item) => item.deletedAt).map((item) => item.id));
    return {
      library: {
        groups: this.all<LibraryGroup>('library-group'),
        items: libraryItems,
        trash: {
          notes: this.all<Note>('note', true).filter((item) => deleted.has(`note:${item.id}`)),
          reminders: this.all<Reminder>('reminder', true).filter((item) =>
            deleted.has(`reminder:${item.id}`),
          ),
        },
      },
      projects: this.all<Project>('project'),
      notes: this.all<Note>('note'),
      reminders: this.all<Reminder>('reminder'),
      journal: this.all<JournalEntry>('journal'),
      results: this.all<ResearchResult>('result'),
      settings: this.settings(),
      hasApiKey: false,
    };
  }
  createLibraryGroup(name: string): LibraryGroup {
    const label = this.libraryGroupName(name);
    const group = { id: randomUUID(), name: label, createdAt: new Date().toISOString() };
    this.put('library-group', group);
    return group;
  }
  private libraryGroupName(name: string, except?: string) {
    const label = text(name, 'Group name', 60);
    if (
      this.all<LibraryGroup>('library-group').some(
        (g) => g.id !== except && g.name.toLowerCase() === label.toLowerCase(),
      )
    )
      throw new Error('A group with that name already exists.');
    return label;
  }
  renameLibraryGroup(id: string, name: string) {
    const group = this.get<LibraryGroup>('library-group', id);
    group.name = this.libraryGroupName(name, id);
    this.put('library-group', group);
    return group;
  }
  removeLibraryGroup(id: string) {
    this.get<LibraryGroup>('library-group', id);
    return this.transaction(() => {
      for (const item of this.all<LibraryItemState>('library-item').filter(
        (item) => item.groupId === id,
      )) {
        delete item.groupId;
        this.put('library-item', item);
      }
      this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('library-group', id);
    });
  }
  private libraryRefs(raw: LibraryItemRef[], includeTrashed = false): LibraryItemRef[] {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 500)
      throw new Error('Select between 1 and 500 items.');
    const found = new Map<string, LibraryItemRef>();
    for (const ref of raw) {
      if (!ref || !['note', 'reminder'].includes(ref.kind))
        throw new Error('Choose a saved note or reminder.');
      const id = text(ref.id, 'Item', 100);
      this.get(ref.kind, id, includeTrashed);
      found.set(`${ref.kind}:${id}`, { kind: ref.kind, id });
    }
    return [...found.values()];
  }
  private libraryState(ref: LibraryItemRef): LibraryItemState {
    return (
      this.all<LibraryItemState>('library-item').find(
        (item) => item.id === `${ref.kind}:${ref.id}`,
      ) ?? { id: `${ref.kind}:${ref.id}`, kind: ref.kind, itemId: ref.id }
    );
  }
  groupItems(raw: LibraryItemRef[], groupId?: string) {
    const refs = this.libraryRefs(raw);
    if (groupId !== undefined) this.get<LibraryGroup>('library-group', groupId);
    this.transaction(() => {
      for (const ref of refs) {
        const state = this.libraryState(ref);
        if (groupId) state.groupId = groupId;
        else delete state.groupId;
        this.put('library-item', state);
      }
    });
  }
  trashItems(raw: LibraryItemRef[]) {
    const refs = this.libraryRefs(raw);
    this.transaction(() => {
      for (const ref of refs) {
        const state = this.libraryState(ref);
        state.deletedAt = new Date().toISOString();
        this.put('library-item', state);
        if (ref.kind === 'note') this.db.prepare('DELETE FROM note_search WHERE id=?').run(ref.id);
        else {
          const reminder = this.get<Reminder>('reminder', ref.id, true);
          this.cancelReminderAttempts(reminder, false);
          this.put('reminder', reminder);
        }
      }
    });
  }
  restoreItems(raw: LibraryItemRef[]) {
    const refs = this.libraryRefs(raw, true);
    this.transaction(() => {
      for (const ref of refs) {
        const state = this.libraryState(ref);
        delete state.deletedAt;
        this.put('library-item', state);
        if (ref.kind === 'note') {
          const note = this.get<Note>('note', ref.id, true);
          this.db.prepare('DELETE FROM note_search WHERE id=?').run(ref.id);
          this.db
            .prepare('INSERT INTO note_search(id,project_id,title,body) VALUES(?,?,?,?)')
            .run(note.id, note.projectId, note.title, note.body);
        }
      }
    });
  }
  findReminder(id: string): Reminder | undefined {
    if (this.isTrashed('reminder', id)) return undefined;
    const row = this.db
      .prepare('SELECT value FROM records WHERE kind=? AND id=?')
      .get('reminder', id) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Reminder) : undefined;
  }
  calendarLinks(): CalendarLink[] {
    return this.all<CalendarLink>('calendar-link');
  }
  saveCalendarLink(link: CalendarLink) {
    this.put('calendar-link', link);
  }
  settings(): Settings {
    const rows = this.all<Settings & { id: string }>('settings');
    return { ...defaults, ...rows[0] };
  }
  saveSettings(patch: Partial<Settings>): Settings {
    const choices: Record<string, readonly string[]> = {
      petAppearance: ['red', 'arctic', 'midnight'],
      petRoamArea: ['bottom', 'desktop', 'parked'],
      petJokeStyle: ['wholesome', 'dad', 'nerdy'],
      petChatter: ['off', 'quiet', 'friendly', 'chatty'],
      petShortcut: ['Control+Alt+P', 'Control+Shift+Space', 'Alt+Shift+P'],
    };
    for (const [key, values] of Object.entries(choices)) {
      if (key in patch && !values.includes(String(patch[key as keyof Settings])))
        throw new Error('Choose one of the available companion settings.');
    }
    const allowed = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) =>
        choices[key]
          ? typeof value === 'string'
          : [
                'petVisible',
                'alwaysOnTop',
                'notifications',
                'providerConsent',
                'petReducedMotion',
                'bubblePinned',
              ].includes(key)
            ? typeof value === 'boolean'
            : ['petX', 'petY'].includes(key) && typeof value === 'number' && Number.isFinite(value),
      ),
    );
    const settings = { ...this.settings(), ...allowed };
    this.put('settings', { ...settings, id: 'settings' });
    return settings;
  }
  createProject(input: { name: string; ticker?: string }): Project {
    const p = {
      id: randomUUID(),
      name: text(input.name, 'Workspace name', 80),
      ticker: text(input.ticker ?? '', 'Ticker', 20, true).toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    this.put('project', p);
    return p;
  }
  saveNote(input: NoteDraft): Note {
    this.get<Project>('project', input.projectId);
    const title = text(input.title, 'Note title', 200);
    if (typeof input.body !== 'string') throw new Error('Add some text to your note.');
    const body = input.body.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (
      !body.trim() ||
      [...body].length > 100000 ||
      Buffer.byteLength(body, 'utf8') > 2 * 1024 * 1024
    )
      throw new Error('Notes need some text and can contain up to 100,000 characters (2 MB).');
    const url = text(input.url ?? '', 'Source link', 2048, true);
    if (url && !/^https?:\/\//i.test(url))
      throw new Error('Source links must begin with https:// or http://.');
    const publishedOn = text(input.publishedOn ?? '', 'Publication date', 10, true);
    if (
      publishedOn &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn) ||
        new Date(publishedOn).toISOString().slice(0, 10) !== publishedOn)
    )
      throw new Error('Choose a valid publication date.');
    const old = input.id ? this.get<Note>('note', input.id) : undefined;
    if (old && old.projectId !== input.projectId)
      throw new Error('This note belongs to another workspace.');
    if (!input.id) {
      const hash = createHash('sha256').update(body).digest('hex');
      const duplicate = this.all<Note>('note').find(
        (n) =>
          n.projectId === input.projectId &&
          createHash('sha256').update(n.body).digest('hex') === hash,
      );
      if (duplicate) return duplicate;
    }
    const now = new Date().toISOString();
    const note: Note = {
      id: old?.id ?? randomUUID(),
      projectId: input.projectId,
      revisionId: randomUUID(),
      title,
      body,
      url,
      publishedOn,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    return this.transaction(() => {
      this.put('revision', { ...note, id: note.revisionId });
      this.put('note', note);
      this.db.prepare('DELETE FROM note_search WHERE id=?').run(note.id);
      this.db
        .prepare('INSERT INTO note_search(id,project_id,title,body) VALUES(?,?,?,?)')
        .run(note.id, note.projectId, title, body);
      return note;
    });
  }
  getNote(projectId: string, id: string): Note {
    const note = this.get<Note>('note', id);
    if (note.projectId !== projectId) throw new Error('This note belongs to another workspace.');
    return note;
  }
  getRevision(projectId: string, revisionId: string): Note {
    const note = this.get<Note>('revision', revisionId);
    if (note.projectId !== projectId)
      throw new Error('This evidence belongs to another workspace.');
    return note;
  }
  search(projectId: string, query: string): Note[] {
    this.get<Project>('project', projectId);
    const terms = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 20) ?? [];
    if (!terms.length) return [];
    const match = terms.map((t) => `"${t.replaceAll('"', '""')}"`).join(' OR ');
    return (
      this.db
        .prepare(
          'SELECT id FROM note_search WHERE note_search MATCH ? AND project_id=? ORDER BY rank LIMIT 8',
        )
        .all(match, projectId) as { id: string }[]
    ).map((r) => this.get<Note>('note', r.id));
  }
  saveReminder(input: ReminderDraft): Reminder {
    if (input.projectId) this.get<Project>('project', input.projectId);
    const old = input.id ? this.get<Reminder>('reminder', input.id) : undefined;
    if (input.remindEnabled !== undefined && typeof input.remindEnabled !== 'boolean')
      throw new Error('Choose whether to enable reminders.');
    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 5 ||
      input.durationMinutes > 1440
    )
      throw new Error('Choose an event length between 5 minutes and 24 hours.');
    const dueAt = validDate(input.dueAt);
    const recurrence =
      input.recurrence === undefined ? old?.recurrence : validRepeatRule(input.recurrence);
    if (input.recurrenceAnchorDay !== undefined)
      validRecurrenceAnchorDay(input.recurrenceAnchorDay);
    // The anchor belongs to the schedule, not to a clamped February occurrence.
    // Only a new local calendar date establishes a new anchor. Time edits and
    // editors rounding snooze seconds must preserve the original monthly day.
    const sameLocalDate =
      old && new Date(old.dueAt).toDateString() === new Date(dueAt).toDateString();
    const recurrenceAnchorDay =
      recurrence === 'monthly'
        ? old?.recurrence === 'monthly' && sameLocalDate
          ? (old.recurrenceAnchorDay ?? new Date(old.dueAt).getDate())
          : new Date(dueAt).getDate()
        : undefined;
    const r: Reminder = {
      id: old?.id ?? randomUUID(),
      projectId: input.projectId ?? '',
      title: text(input.title, 'Reminder title', 200),
      details: text(input.details ?? '', 'Reminder details', 5000, true),
      dueAt,
      durationMinutes: input.durationMinutes,
      completed: old?.completed ?? false,
      calendarSync:
        typeof input.calendarSync === 'boolean' ? input.calendarSync : (old?.calendarSync ?? false),
      remindEnabled: input.remindEnabled ?? old?.remindEnabled ?? true,
      recurrence,
      recurrenceAnchorDay,
      notifiedAt: old?.notifiedAt ?? null,
      notificationAttemptAt: old?.notificationAttemptAt,
      notificationRetryAt: old?.notificationRetryAt,
      notificationError: old?.notificationError,
      notificationFailures: old?.notificationFailures,
      createdAt: old?.createdAt ?? new Date().toISOString(),
    };
    return this.transaction(() => {
      if (old && (old.dueAt !== r.dueAt || old.remindEnabled !== r.remindEnabled)) {
        this.cancelReminderAttempts(r, old.dueAt !== r.dueAt);
      }
      this.put('reminder', r);
      return r;
    });
  }
  getReminder(id: string) {
    return this.get<Reminder>('reminder', id);
  }
  completeReminder(id: string, completed: boolean) {
    if (typeof completed !== 'boolean') throw new Error('Invalid reminder state.');
    const r = this.getReminder(id);
    const advances = completed && r.recurrence !== undefined && r.recurrence !== 'none';
    if (advances) {
      if (r.recurrence === 'monthly') r.recurrenceAnchorDay ??= new Date(r.dueAt).getDate();
      r.dueAt = nextRecurringDueAt(r.dueAt, r.recurrence!, new Date(), r.recurrenceAnchorDay);
    }
    r.completed = advances ? false : completed;
    return this.transaction(() => {
      this.cancelReminderAttempts(r, advances);
      if (!completed) r.notifiedAt = null;
      this.put('reminder', r);
      return r;
    });
  }
  snoozeReminder(id: string, dueAt: string) {
    const r = this.getReminder(id);
    const nextDueAt = validDate(dueAt);
    const changed = r.dueAt !== nextDueAt;
    // Snooze shifts the current occurrence and its wall time/cadence. Monthly
    // routines retain the original day anchor, including when snoozed in February.
    if (r.recurrence === 'monthly') r.recurrenceAnchorDay ??= new Date(r.dueAt).getDate();
    r.dueAt = nextDueAt;
    r.completed = false;
    return this.transaction(() => {
      this.cancelReminderAttempts(r, changed);
      this.put('reminder', r);
      return r;
    });
  }
  private reminderSchedule(reminder: Reminder): ReminderSchedule {
    const row = this.db
      .prepare('SELECT value FROM records WHERE kind=? AND id=?')
      .get('reminder-schedule', reminder.id) as { value: string } | undefined;
    const saved = row ? (JSON.parse(row.value) as ReminderSchedule) : undefined;
    if (saved?.dueAt === reminder.dueAt) return saved;
    const schedule: ReminderSchedule = {
      id: reminder.id,
      dueAt: reminder.dueAt,
      stages: {},
      lastAttemptAt: saved?.lastAttemptAt,
    };
    // Existing single-alert reminders were delivered at/after the event. Carry that
    // acknowledgement into the checkpoint ledger when upgrading an old database.
    if (!saved && reminder.notifiedAt) {
      for (const offset of REMINDER_LEAD_MINUTES) {
        if (Date.parse(reminder.dueAt) - offset * 60000 <= Date.parse(reminder.notifiedAt))
          schedule.stages[offset] = { settled: true };
      }
    }
    return schedule;
  }
  private cancelReminderAttempts(reminder: Reminder, reset: boolean) {
    const schedule = this.reminderSchedule(reminder);
    if (reset) {
      schedule.stages = {};
      reminder.notifiedAt = null;
    } else {
      for (const stage of Object.values(schedule.stages)) {
        delete stage.attemptAt;
        delete stage.retryAt;
        stage.failures = 0;
      }
    }
    reminder.notificationAttemptAt = null;
    reminder.notificationRetryAt = null;
    reminder.notificationError = false;
    reminder.notificationFailures = 0;
    this.put('reminder-schedule', schedule);
  }
  takeReminderAlerts(now: string): ReminderAlert[] {
    const time = Date.parse(validDate(now));
    return this.transaction(() => {
      const alerts: ReminderAlert[] = [];
      for (const reminder of this.all<Reminder>('reminder')) {
        if (reminder.completed || reminder.remindEnabled === false) continue;
        const schedule = this.reminderSchedule(reminder);
        const elapsed = REMINDER_LEAD_MINUTES.filter(
          (offset) => Date.parse(reminder.dueAt) - offset * 60000 <= time,
        );
        const offsetMinutes = elapsed.at(-1);
        // Earlier missed checkpoints are superseded, including interrupted or
        // failed attempts. A resume can therefore display at most one alert.
        for (const offset of elapsed.slice(0, -1)) schedule.stages[offset] = { settled: true };
        if (offsetMinutes !== undefined) {
          const stage = (schedule.stages[offsetMinutes] ??= {});
          if (
            !stage.settled &&
            (!stage.retryAt || Date.parse(stage.retryAt) <= time) &&
            (!stage.attemptAt || Date.parse(stage.attemptAt) + 5 * 60000 <= time)
          ) {
            // Monotonic reservation timestamps also distinguish a stale callback
            // after off/on or changing a due time away and back in the same tick.
            const attemptAt = new Date(
              Math.max(
                time,
                schedule.lastAttemptAt ? Date.parse(schedule.lastAttemptAt) + 1 : time,
              ),
            ).toISOString();
            stage.attemptAt = attemptAt;
            schedule.lastAttemptAt = attemptAt;
            reminder.notificationAttemptAt = attemptAt;
            this.put('reminder', reminder);
            alerts.push({
              reminder,
              offsetMinutes,
              attemptAt,
              scheduledAt: new Date(
                Date.parse(reminder.dueAt) - offsetMinutes * 60000,
              ).toISOString(),
            });
          }
        }
        this.put('reminder-schedule', schedule);
      }
      return alerts;
    });
  }
  finishReminderAlert(alert: ReminderAlert, successful: boolean): void {
    this.transaction(() => {
      const reminder = this.findReminder(alert.reminder.id);
      if (
        !reminder ||
        reminder.completed ||
        reminder.remindEnabled === false ||
        reminder.dueAt !== alert.reminder.dueAt
      )
        return;
      const schedule = this.reminderSchedule(reminder);
      const stage = schedule.stages[alert.offsetMinutes];
      if (!stage || stage.settled || stage.attemptAt !== alert.attemptAt) return;
      delete stage.attemptAt;
      reminder.notificationAttemptAt = null;
      reminder.notificationError = !successful;
      if (successful) {
        stage.settled = true;
        delete stage.retryAt;
        stage.failures = 0;
        reminder.notifiedAt = alert.attemptAt;
      } else {
        stage.failures = Math.min(6, (stage.failures ?? 0) + 1);
        stage.retryAt = new Date(
          Date.parse(alert.attemptAt) + Math.min(60, 5 * 2 ** (stage.failures - 1)) * 60000,
        ).toISOString();
      }
      reminder.notificationRetryAt = stage.retryAt ?? null;
      reminder.notificationFailures = stage.failures;
      this.put('reminder-schedule', schedule);
      this.put('reminder', reminder);
    });
  }
  takeDueReminders(now: string): Reminder[] {
    const time = Date.parse(validDate(now));
    return this.transaction(() => {
      const due = this.all<Reminder>('reminder').filter(
        (r) =>
          !r.completed &&
          r.remindEnabled !== false &&
          !r.notifiedAt &&
          Date.parse(r.dueAt) <= time &&
          (!r.notificationRetryAt || Date.parse(r.notificationRetryAt) <= time) &&
          (!r.notificationAttemptAt || Date.parse(r.notificationAttemptAt) + 5 * 60000 <= time),
      );
      due.forEach((r) => {
        r.notificationAttemptAt = new Date(time).toISOString();
        this.put('reminder', r);
      });
      return due;
    });
  }
  finishNotification(id: string, attemptAt: string, successful: boolean) {
    const r = this.findReminder(id);
    if (!r || r.completed || r.remindEnabled === false || r.notificationAttemptAt !== attemptAt)
      return;
    r.notificationAttemptAt = null;
    r.notificationError = !successful;
    if (successful) {
      r.notifiedAt = attemptAt;
      r.notificationRetryAt = null;
      r.notificationFailures = 0;
    } else {
      r.notificationFailures = Math.min(6, (r.notificationFailures ?? 0) + 1);
      r.notificationRetryAt = new Date(
        Date.parse(attemptAt) + Math.min(60, 5 * 2 ** (r.notificationFailures - 1)) * 60000,
      ).toISOString();
    }
    this.put('reminder', r);
  }
  saveJournal(input: JournalDraft): JournalEntry {
    this.get<Project>('project', input.projectId);
    const thesis = text(input.thesis, 'Your thesis', 20000);
    if (!Array.isArray(input.evidence) || input.evidence.length > 100)
      throw new Error('Invalid evidence.');
    for (const c of input.evidence) {
      const revision = this.getRevision(input.projectId, c.revisionId);
      if (!c.quote || !revision.body.includes(c.quote))
        throw new Error('Evidence must match a saved passage.');
    }
    if (
      input.entryId &&
      !this.all<JournalEntry>('journal').some(
        (j) => j.entryId === input.entryId && j.projectId === input.projectId,
      )
    )
      throw new Error('Journal entry not found.');
    const j: JournalEntry = {
      id: randomUUID(),
      entryId: input.entryId ?? randomUUID(),
      projectId: input.projectId,
      thesis,
      counterarguments: text(input.counterarguments, 'Counterarguments', 20000, true),
      conditions: text(input.conditions, 'What would change your mind', 20000, true),
      evidence: input.evidence,
      createdAt: new Date().toISOString(),
    };
    this.put('journal', j);
    return j;
  }
  saveResult(result: ResearchResult): ResearchResult {
    this.get<Project>('project', result.projectId);
    for (const p of result.points) {
      const note = this.getRevision(result.projectId, p.citation.revisionId);
      if (!p.citation.quote || !note.body.includes(p.citation.quote))
        throw new Error('The summary could not be checked against your notes. Please try again.');
    }
    this.put('result', result);
    return result;
  }
}
