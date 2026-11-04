import { describe, it, expect, vi } from 'vitest';
import { BuddyStore } from '../src/core/store';
import { CalendarSync, type CalendarConnection } from '../src/core/calendar-sync';
const config = {
  credentials: { clientId: 'sample.apps.googleusercontent.com' },
  tokens: {
    accessToken: 'private-access',
    refreshToken: 'private-refresh',
    expiresAt: 9999999999999,
  },
};
function fixture() {
  const store = new BuddyStore(':memory:');
  let vault: CalendarConnection | undefined = config;
  const writes: any[] = [];
  const client = {
    connected: true,
    connect: vi.fn(async () => {
      client.connected = true;
    }),
    cancelConnect: vi.fn(),
    disconnect: vi.fn(async () => {
      client.connected = false;
    }),
    upsertReminder: vi.fn(async (r: any, _eventId?: string) => {
      writes.push({ ...r });
      return { eventId: 'rb' + r.id.replaceAll('-', '') };
    }),
  };
  const sync = new CalendarSync({
    store,
    load: () => vault,
    save: (v) => {
      vault = v;
    },
    openExternal: async () => {},
    onChange: () => {},
    clientFactory: () => client,
  });
  return { store, client, sync, writes, vault: () => vault };
}
describe('calendar reminder outbox', () => {
  it('rechecks sync consent for queued items before any upload', async () => {
    const f = fixture();
    const b = f.store.saveReminder({
      title: 'Do not send',
      dueAt: '2030-01-01T13:00:00Z',
      durationMinutes: 30,
      calendarSync: true,
    });
    f.store.saveReminder({
      title: 'First',
      dueAt: '2030-01-01T14:00:00Z',
      durationMinutes: 30,
      calendarSync: true,
    });
    let release!: () => void;
    const blocked = new Promise<void>((r) => {
      release = r;
    });
    f.client.upsertReminder.mockImplementationOnce(async (r) => {
      await blocked;
      f.writes.push({ ...r });
      return { eventId: 'rb' + r.id.replaceAll('-', '') };
    });
    const running = f.sync.sync();
    await Promise.resolve();
    f.store.saveReminder({ ...b, calendarSync: false });
    release();
    await running;
    expect(f.writes.map((r) => r.title)).toEqual(['First']);
    f.store.close();
  });
  it('resends opted-in reminders after a fresh account authorization', async () => {
    const f = fixture();
    f.store.saveReminder({
      title: 'Account change',
      dueAt: '2030-01-01T13:00:00Z',
      durationMinutes: 30,
      calendarSync: true,
    });
    await f.sync.sync();
    await f.sync.disconnect();
    await f.sync.connect();
    expect(f.writes).toHaveLength(2);
    expect(f.client.upsertReminder.mock.calls[1][1]).toBeUndefined();
    f.store.close();
  });
  it('only syncs opted-in reminders and updates an event after an edit without duplicating unchanged writes', async () => {
    const f = fixture();
    f.store.saveReminder({
      title: 'Local only',
      dueAt: '2030-01-01T12:00:00Z',
      durationMinutes: 30,
    });
    const r = f.store.saveReminder({
      title: 'Google event',
      dueAt: '2030-01-01T13:00:00Z',
      durationMinutes: 30,
      calendarSync: true,
    });
    expect(f.sync.status.pending).toBe(1);
    await f.sync.sync();
    expect(f.writes.map((r) => r.title)).toEqual(['Google event']);
    await f.sync.sync();
    expect(f.writes).toHaveLength(1);
    f.store.saveReminder({ ...r, title: 'Updated time', dueAt: '2030-01-01T14:00:00Z' });
    await f.sync.sync();
    expect(f.writes).toHaveLength(2);
    expect(f.client.upsertReminder.mock.calls[1][1]).toBeTruthy();
    expect(f.sync.status.pending).toBe(0);
    f.store.close();
  });
  it('keeps failures pending and retries without exposing credentials in public status', async () => {
    const f = fixture();
    f.store.saveReminder({
      title: 'Retry',
      dueAt: '2030-01-01T13:00:00Z',
      durationMinutes: 30,
      calendarSync: true,
    });
    f.client.upsertReminder.mockRejectedValueOnce(new Error('Network unavailable.'));
    await f.sync.sync();
    expect(f.sync.status.pending).toBe(1);
    expect(f.sync.status.error).toContain('Network');
    await f.sync.sync();
    expect(f.sync.status.pending).toBe(0);
    expect(JSON.stringify(f.sync.status)).not.toContain('private-');
    f.store.close();
  });
  it('leaves local reminders queued while disconnected and clears local credentials on disconnect', async () => {
    const f = fixture();
    f.client.connected = false;
    f.store.saveReminder({
      title: 'Offline',
      dueAt: '2030-01-01T13:00:00Z',
      durationMinutes: 30,
      calendarSync: true,
    });
    await f.sync.sync();
    expect(f.writes).toHaveLength(0);
    expect(f.sync.status.pending).toBe(1);
    await f.sync.disconnect();
    expect(f.vault()?.tokens).toBeUndefined();
    expect(f.store.snapshot().reminders).toHaveLength(1);
    f.store.close();
  });
});
