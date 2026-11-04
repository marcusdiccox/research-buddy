import { createHash } from 'node:crypto';
import { GoogleCalendarClient, type GoogleTokens } from './google-calendar.js';
import type { BuddyStore } from './store.js';
import type { CalendarStatus, Reminder } from '../shared/contracts.js';
export interface CalendarConnection {
  credentials: { clientId: string; clientSecret?: string };
  tokens?: GoogleTokens;
}
type Client = Pick<
  GoogleCalendarClient,
  'connected' | 'connect' | 'cancelConnect' | 'disconnect' | 'upsertReminder'
>;
type ClientOptions = ConstructorParameters<typeof GoogleCalendarClient>[0];
interface Options {
  store: BuddyStore;
  load: () => CalendarConnection | undefined;
  save: (value: CalendarConnection) => void;
  openExternal: (url: string) => Promise<void>;
  onChange: () => void;
  clientFactory?: (options: ClientOptions) => Client;
}
const fingerprint = (r: Reminder) =>
  createHash('sha256')
    .update(JSON.stringify([r.title, r.details, r.dueAt, r.durationMinutes, r.completed]))
    .digest('hex');
export class CalendarSync {
  private connection: CalendarConnection | undefined;
  private client: Client | undefined;
  private running: Promise<void> | undefined;
  private again = false;
  private generation = 0;
  private error: string | undefined;
  constructor(private options: Options) {
    try {
      this.connection = options.load();
      this.makeClient();
    } catch {
      this.error =
        'Google connection could not be unlocked on this computer. Import credentials again.';
    }
  }
  private makeClient() {
    const connection = this.connection;
    if (!connection) {
      this.client = undefined;
      return;
    }
    const generation = this.generation;
    this.client = (this.options.clientFactory ?? ((o) => new GoogleCalendarClient(o)))({
      ...connection,
      onTokens: (tokens) => {
        if (generation !== this.generation) return;
        const next = { credentials: connection.credentials, tokens: tokens ?? undefined };
        this.options.save(next);
        this.connection = next;
        this.options.onChange();
      },
    });
  }
  get status(): CalendarStatus {
    const links = this.options.store.calendarLinks();
    const opted = this.options.store.snapshot().reminders.filter((r) => r.calendarSync);
    const pending = opted.filter(
      (r) =>
        !links.some(
          (l) => l.id === r.id && l.state === 'synced' && l.fingerprint === fingerprint(r),
        ),
    ).length;
    return {
      configured: !!this.connection,
      connected: !!this.client?.connected,
      autoSync: !!this.client?.connected,
      pending,
      error: this.error,
      lastSyncAt: links
        .map((l) => l.syncedAt)
        .filter((v): v is string => !!v)
        .sort()
        .at(-1),
    };
  }
  configure(raw: unknown) {
    if (this.client?.connected)
      throw new Error('Disconnect Google before replacing its app registration.');
    if (!raw || typeof raw !== 'object' || !('installed' in raw))
      throw new Error('Choose the JSON for a Google Desktop app OAuth client.');
    const installed = (raw as { installed: any }).installed;
    if (
      !installed ||
      typeof installed.client_id !== 'string' ||
      !installed.client_id.endsWith('.apps.googleusercontent.com') ||
      installed.client_id.length > 500 ||
      (installed.client_secret !== undefined &&
        (typeof installed.client_secret !== 'string' || installed.client_secret.length > 1000))
    )
      throw new Error('That file is not a valid Google Desktop app registration.');
    const next = {
      credentials: { clientId: installed.client_id, clientSecret: installed.client_secret },
    };
    this.options.save(next);
    this.generation++;
    this.client?.cancelConnect();
    this.connection = next;
    this.makeClient();
    this.error = undefined;
    this.options.onChange();
  }
  async connect() {
    if (!this.client) throw new Error('Import Google Desktop app credentials first.');
    this.error = undefined;
    try {
      await this.client.connect(this.options.openExternal);
      // New authorization can select another account; deterministic POST/409 recovers its own events.
      for (const link of this.options.store.calendarLinks())
        this.options.store.saveCalendarLink({ id: link.id, state: 'pending' });
      await this.sync();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Google could not connect.';
      throw error;
    } finally {
      this.options.onChange();
    }
  }
  async disconnect() {
    const client = this.client;
    this.generation++;
    client?.cancelConnect();
    if (this.connection) {
      this.connection = { credentials: this.connection.credentials };
      this.options.save(this.connection);
    }
    this.makeClient();
    this.error = undefined;
    this.options.onChange();
    try {
      await client?.disconnect();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : 'Disconnected locally. Google revocation failed.';
      throw error;
    } finally {
      this.options.onChange();
    }
  }
  cancelConnect() {
    this.client?.cancelConnect();
  }
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.flush().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async flush() {
    do {
      this.again = false;
      const client = this.client,
        generation = this.generation;
      if (!client?.connected) return;
      this.error = undefined;
      for (const queued of this.options.store.snapshot().reminders.filter((r) => r.calendarSync)) {
        const reminder = this.options.store.snapshot().reminders.find((r) => r.id === queued.id);
        if (!reminder?.calendarSync) continue;
        const prior = this.options.store.calendarLinks().find((l) => l.id === reminder.id),
          hash = fingerprint(reminder);
        if (prior?.state === 'synced' && prior.fingerprint === hash) continue;
        this.options.store.saveCalendarLink({ ...prior, id: reminder.id, state: 'pending' });
        this.options.onChange();
        try {
          const remote = await client.upsertReminder(reminder, prior?.eventId);
          if (generation !== this.generation) return;
          this.options.store.saveCalendarLink({
            id: reminder.id,
            eventId: remote.eventId,
            fingerprint: hash,
            state: 'synced',
            syncedAt: new Date().toISOString(),
          });
          const latest = this.options.store.snapshot().reminders.find((r) => r.id === reminder.id);
          if (latest?.calendarSync && fingerprint(latest) !== hash) this.again = true;
        } catch (error) {
          if (generation !== this.generation) return;
          this.error =
            error instanceof Error
              ? error.message
              : 'Calendar sync failed. Will retry while Pip is running.';
          this.options.store.saveCalendarLink({
            ...prior,
            id: reminder.id,
            state: 'error',
            error: this.error,
          });
        }
        this.options.onChange();
      }
    } while (this.again);
  }
  dispose() {
    this.generation++;
    this.client?.cancelConnect();
  }
}
