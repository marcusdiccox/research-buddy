import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import type {
  Project,
  Note,
  NoteDraft,
  Reminder,
  ReminderDraft,
  JournalEntry,
  JournalDraft,
  ResearchResult,
  Snapshot,
  Settings,
} from '../shared/contracts.js';

const defaults: Settings = {
  petVisible: true,
  alwaysOnTop: true,
  notifications: true,
  providerConsent: false,
};
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
  private all<T>(kind: string): T[] {
    return (
      this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid DESC').all(kind) as {
        value: string;
      }[]
    ).map((r) => JSON.parse(r.value) as T);
  }
  private put<T extends { id: string; projectId?: string }>(kind: string, item: T) {
    this.db
      .prepare('INSERT OR REPLACE INTO records(kind,id,project_id,value) VALUES(?,?,?,?)')
      .run(kind, item.id, item.projectId ?? '', JSON.stringify(item));
  }
  private get<T>(kind: string, id: string): T {
    const row = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id) as
      { value: string } | undefined;
    if (!row) throw new Error('That item could not be found.');
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
    return {
      projects: this.all<Project>('project'),
      notes: this.all<Note>('note'),
      reminders: this.all<Reminder>('reminder'),
      journal: this.all<JournalEntry>('journal'),
      results: this.all<ResearchResult>('result'),
      settings: this.settings(),
      hasApiKey: false,
    };
  }
  settings(): Settings {
    const rows = this.all<Settings & { id: string }>('settings');
    return { ...defaults, ...rows[0] };
  }
  saveSettings(patch: Partial<Settings>): Settings {
    const allowed = Object.fromEntries(
      Object.entries(patch).filter(([key, value]) =>
        ['petVisible', 'alwaysOnTop', 'notifications', 'providerConsent'].includes(key)
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
    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 5 ||
      input.durationMinutes > 1440
    )
      throw new Error('Choose an event length between 5 minutes and 24 hours.');
    const r: Reminder = {
      id: old?.id ?? randomUUID(),
      projectId: input.projectId ?? '',
      title: text(input.title, 'Reminder title', 200),
      details: text(input.details ?? '', 'Reminder details', 5000, true),
      dueAt: validDate(input.dueAt),
      durationMinutes: input.durationMinutes,
      completed: old?.completed ?? false,
      notifiedAt: null,
      createdAt: old?.createdAt ?? new Date().toISOString(),
    };
    this.put('reminder', r);
    return r;
  }
  getReminder(id: string) {
    return this.get<Reminder>('reminder', id);
  }
  completeReminder(id: string, completed: boolean) {
    if (typeof completed !== 'boolean') throw new Error('Invalid reminder state.');
    const r = this.getReminder(id);
    r.completed = completed;
    r.notificationAttemptAt = null;
    r.notificationRetryAt = null;
    r.notificationError = false;
    r.notificationFailures = 0;
    if (!completed) r.notifiedAt = null;
    this.put('reminder', r);
    return r;
  }
  snoozeReminder(id: string, dueAt: string) {
    const r = this.getReminder(id);
    r.dueAt = validDate(dueAt);
    r.notifiedAt = null;
    r.notificationAttemptAt = null;
    r.notificationRetryAt = null;
    r.notificationError = false;
    r.notificationFailures = 0;
    r.completed = false;
    this.put('reminder', r);
    return r;
  }
  takeDueReminders(now: string): Reminder[] {
    const time = Date.parse(validDate(now));
    return this.transaction(() => {
      const due = this.all<Reminder>('reminder').filter(
        (r) =>
          !r.completed &&
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
    const r = this.getReminder(id);
    if (r.completed || r.notificationAttemptAt !== attemptAt) return;
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
