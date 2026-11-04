import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarClient, type GoogleTokens } from '../src/core/google-calendar';

const reminder = {
  id: 'local-1',
  title: 'Read paper',
  details: 'Chapter 2',
  dueAt: '2026-11-04T14:00:00.000Z',
  durationMinutes: 30,
  completed: false,
};
const tokens = {
  accessToken: 'access-private',
  refreshToken: 'refresh-private',
  expiresAt: 900_000,
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function client(
  fetcher: typeof fetch,
  initial: GoogleTokens | undefined = tokens,
  onTokens = vi.fn(),
) {
  return new GoogleCalendarClient({
    credentials: { clientId: 'desktop.apps.googleusercontent.com', clientSecret: 'desktop-secret' },
    tokens: initial,
    onTokens,
    fetch: fetcher,
    now: () => 100_000,
  });
}

describe('Google Calendar connection', () => {
  it('exchanges a real loopback callback with state and S256 proof; ignores other paths', async () => {
    let auth!: URL;
    let form!: URLSearchParams;
    const changed = vi.fn();
    const service = client(
      (async (url, init) => {
        expect(String(url)).toBe('https://oauth2.googleapis.com/token');
        form = new URLSearchParams(String(init?.body));
        return reply({
          access_token: 'new-private',
          refresh_token: 'offline-private',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/calendar.events.owned',
        });
      }) as typeof fetch,
      undefined,
      changed,
    );
    await service.connect(async (url) => {
      auth = new URL(url);
      expect(auth.origin).toBe('https://accounts.google.com');
      expect(auth.searchParams.get('scope')).toBe(
        'https://www.googleapis.com/auth/calendar.events.owned',
      );
      expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
      const redirect = new URL(auth.searchParams.get('redirect_uri')!);
      expect(redirect.hostname).toBe('127.0.0.1');
      expect((await fetch(`${redirect.origin}/favicon.ico`)).status).toBe(404);
      redirect.search = new URLSearchParams({
        code: 'one-use-code',
        state: auth.searchParams.get('state')!,
      }).toString();
      expect((await fetch(redirect)).status).toBe(200);
    });
    expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(
      auth.searchParams.get('code_challenge'),
    );
    expect(form.get('client_secret')).toBe('desktop-secret');
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshToken: 'offline-private', expiresAt: 3_700_000 }),
    );
    expect(service.connected).toBe(true);
  });

  it.each(['wrong', 'é'.repeat(43)])(
    'rejects mismatched state %s without exchanging tokens and closes callback listener',
    async (state) => {
      const boundary = vi.fn();
      const service = client(boundary as typeof fetch);
      let redirect!: URL;
      await expect(
        service.connect(async (url) => {
          redirect = new URL(new URL(url).searchParams.get('redirect_uri')!);
          redirect.search = new URLSearchParams({ code: 'secret-code', state }).toString();
          expect((await fetch(redirect)).status).toBe(400);
        }),
      ).rejects.toThrow(/state/i);
      expect(boundary).not.toHaveBeenCalled();
      await expect(fetch(redirect)).rejects.toThrow();
    },
  );

  it('handles denied consent and cancellation without token exchange', async () => {
    const boundary = vi.fn();
    const service = client(boundary as typeof fetch);
    await expect(
      service.connect(async (url) => {
        const auth = new URL(url);
        const redirect = new URL(auth.searchParams.get('redirect_uri')!);
        redirect.search = new URLSearchParams({
          error: 'access_denied',
          state: auth.searchParams.get('state')!,
        }).toString();
        await fetch(redirect);
      }),
    ).rejects.toThrow(/denied/i);
    await expect(
      service.connect(async () => {
        service.cancelConnect();
      }),
    ).rejects.toThrow(/cancel/i);
    expect(boundary).not.toHaveBeenCalled();
  });

  it('closes the loopback listener when authorization times out', async () => {
    const boundary = vi.fn();
    const service = client(boundary as typeof fetch);
    let redirect!: string;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await expect(
        service.connect(async (url) => {
          redirect = new URL(url).searchParams.get('redirect_uri')!;
          await vi.advanceTimersByTimeAsync(180_001);
        }),
      ).rejects.toThrow(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
    await expect(fetch(redirect)).rejects.toThrow();
    expect(boundary).not.toHaveBeenCalled();
  });

  it('clears locally and accurately reports failed revocation without exposing secrets', async () => {
    const changed = vi.fn();
    const service = client(
      (async () => {
        throw new Error('network refresh-private');
      }) as typeof fetch,
      tokens,
      changed,
    );
    await expect(service.disconnect()).rejects.toThrow(
      'Disconnected locally; Google token revocation failed.',
    );
    expect(service.connected).toBe(false);
    expect(changed).toHaveBeenLastCalledWith(null);
  });
});

describe('Google reminder synchronization', () => {
  it('refreshes once on 401, preserving the refresh token, and sends only owned event fields', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const changed = vi.fn();
    const service = client(
      (async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).includes('/token'))
          return reply({ access_token: 'renewed-private', expires_in: 3600 });
        if (calls.length === 1) return reply({ error: { message: 'private error' } }, 401);
        return reply({
          id: JSON.parse(String(init?.body)).id,
          htmlLink: 'https://calendar.google.com/calendar/event?eid=one',
        });
      }) as typeof fetch,
      tokens,
      changed,
    );
    const result = await service.upsertReminder(reminder);
    expect(calls.map((entry) => entry.url)).toEqual([
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',
      'https://oauth2.googleapis.com/token',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',
    ]);
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshToken: 'refresh-private', accessToken: 'renewed-private' }),
    );
    expect(result.eventId).toMatch(/^rb[a-f0-9]{64}$/);
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      id: result.eventId,
      summary: 'Read paper',
      description: 'Chapter 2\n\nResearch Buddy reminder · Pending',
      start: { dateTime: '2026-11-04T14:00:00.000Z' },
      end: { dateTime: '2026-11-04T14:30:00.000Z' },
    });
  });

  it('uses deterministic IDs and patches on conflict; serializes edits in call order', async () => {
    const calls: { method: string; body: Record<string, unknown>; url: string }[] = [];
    let inFlight = 0;
    const service = client((async (url, init) => {
      expect(inFlight++).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      const body = JSON.parse(String(init?.body));
      calls.push({ method: init?.method!, body, url: String(url) });
      if (init?.method === 'POST') return reply({}, 409);
      return reply({ id: String(url).split('/').pop()!.split('?')[0] });
    }) as typeof fetch);
    const [first, second] = await Promise.all([
      service.upsertReminder(reminder),
      service.upsertReminder({ ...reminder, title: 'Edited', completed: true }),
    ]);
    expect(first.eventId).toBe(second.eventId);
    expect(calls.map((call) => call.method)).toEqual(['POST', 'PATCH', 'POST', 'PATCH']);
    expect(calls[3].body.summary).toBe('✓ Edited');
    expect(calls[3].body).not.toHaveProperty('id');
    await expect(service.upsertReminder(reminder, 'unrelated-event')).rejects.toThrow(/belong/i);
    expect(calls).toHaveLength(4);
  });

  it('surfaces retryable rate/server failures and sanitizes upstream error content', async () => {
    for (const status of [429, 503]) {
      const service = client((async () =>
        reply({ error: 'access-private refresh-private' }, status)) as typeof fetch);
      await expect(service.upsertReminder(reminder)).rejects.toThrow(/try again/i);
    }
  });

  it('validates dates before sending a request and requires a viable connection', async () => {
    const boundary = vi.fn();
    const service = client(boundary as typeof fetch);
    await expect(service.upsertReminder({ ...reminder, dueAt: 'bad' })).rejects.toThrow(/valid/i);
    expect(boundary).not.toHaveBeenCalled();
    const expired = client(boundary as typeof fetch, { accessToken: 'expired', expiresAt: 0 });
    expect(expired.connected).toBe(false);
    await expect(expired.upsertReminder(reminder)).rejects.toThrow(/connect/i);
  });
});
