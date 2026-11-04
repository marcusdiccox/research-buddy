import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
};
export type GoogleReminder = {
  id: string;
  title: string;
  details?: string;
  dueAt: string;
  durationMinutes: number;
  completed: boolean;
};
type Options = {
  credentials: { clientId: string; clientSecret?: string };
  tokens?: GoogleTokens;
  onTokens: (tokens: GoogleTokens | null) => void;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
};

const scope = 'https://www.googleapis.com/auth/calendar.events.owned';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const eventsUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Desktop OAuth and writes to this app's deterministic reminder events only. */
export class GoogleCalendarClient {
  private tokens: GoogleTokens | undefined;
  private readonly requestFetch: typeof globalThis.fetch;
  private readonly now: () => number;
  private cancelAuthorization?: () => void;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: Options) {
    this.tokens = options.tokens ? { ...options.tokens } : undefined;
    this.requestFetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  get connected(): boolean {
    return !!(
      this.tokens?.refreshToken ||
      (this.tokens?.accessToken && this.tokens.expiresAt > this.now())
    );
  }

  cancelConnect(): void {
    this.cancelAuthorization?.();
  }

  async connect(openExternal: (url: string) => Promise<void>): Promise<void> {
    if (this.cancelAuthorization) throw new Error('Google connection is already in progress.');
    if (!this.options.credentials.clientId.trim())
      throw new Error('Import Google Desktop app credentials first.');
    const generation = this.generation;
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const path = '/oauth2/callback';
    let resolveCode!: (code: string) => void;
    let rejectCode!: (error: Error) => void;
    let settled = false;
    let cancelled = false;
    const authorization = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    // Attach the handler before any callback can reject the authorization promise.
    void authorization.catch(() => undefined);
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      rejectCode(new Error(message));
    };
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Security-Policy', "default-src 'none'");
      const callback = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method !== 'GET' || callback.pathname !== path || settled) {
        response.writeHead(404).end('Not found.');
        return;
      }
      const receivedState = callback.searchParams.get('state') ?? '';
      const receivedBytes = Buffer.from(receivedState);
      const expectedBytes = Buffer.from(state);
      const validState =
        receivedBytes.length === expectedBytes.length &&
        timingSafeEqual(receivedBytes, expectedBytes);
      if (!validState) {
        response.writeHead(400).end('Authorization state did not match. Return to Research Buddy.');
        fail('Google authorization state did not match. Please connect again.');
      } else if (callback.searchParams.has('error')) {
        response.writeHead(400).end('Authorization was not granted. Return to Research Buddy.');
        fail('Google authorization was denied or cancelled.');
      } else {
        const code = callback.searchParams.get('code');
        if (!code) {
          response.writeHead(400).end('Missing authorization code.');
          fail('Google did not return an authorization code.');
        } else {
          settled = true;
          response
            .writeHead(200)
            .end(
              'Google connection authorized. You can close this tab and return to Research Buddy.',
            );
          resolveCode(code);
        }
      }
    });
    const close = () => {
      server.close();
      server.closeIdleConnections();
    };
    this.cancelAuthorization = () => {
      cancelled = true;
      fail('Google connection was cancelled.');
      close();
    };
    const timer = setTimeout(() => {
      cancelled = true;
      fail('Google connection timed out. Please connect again.');
      close();
    }, 180_000);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', () =>
          reject(new Error('Could not open the Google authorization callback.')),
        );
        server.listen(0, '127.0.0.1', resolve);
      });
      if (cancelled) throw new Error('Google connection was cancelled.');
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Could not open the Google authorization callback.');
      const redirect = `http://127.0.0.1:${address.port}${path}`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: this.options.credentials.clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope,
        state,
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      void Promise.resolve()
        .then(() => openExternal(url.toString()))
        .catch(() => fail('Could not open the browser for Google authorization.'));
      const code = await authorization;
      close();
      const result = await this.exchange({
        code,
        code_verifier: verifier,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      });
      if (cancelled || generation !== this.generation)
        throw new Error('Google connection was cancelled.');
      this.saveTokens(result);
    } finally {
      clearTimeout(timer);
      close();
      this.cancelAuthorization = undefined;
    }
  }

  async disconnect(): Promise<void> {
    const revoke = this.tokens?.refreshToken ?? this.tokens?.accessToken;
    this.generation++;
    this.cancelConnect();
    this.tokens = undefined;
    this.options.onTokens(null);
    if (!revoke) return;
    try {
      const response = await this.request('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: revoke }).toString(),
      });
      if (!response.ok) throw new Error('Revocation failed.');
    } catch {
      throw new Error('Disconnected locally; Google token revocation failed.');
    }
  }

  upsertReminder(
    reminder: GoogleReminder,
    eventId?: string,
  ): Promise<{ eventId: string; htmlLink?: string }> {
    // Snapshot edits immediately; requests execute in the same order they were submitted.
    const snapshot = { ...reminder };
    const generation = this.generation;
    const work = this.queue.then(() => {
      if (generation !== this.generation)
        throw new Error('Google connection changed. Please sync again.');
      return this.writeReminder(snapshot, eventId);
    });
    this.queue = work.catch(() => undefined);
    return work;
  }

  private async writeReminder(reminder: GoogleReminder, eventId?: string) {
    const start = new Date(reminder.dueAt);
    if (
      !reminder.id ||
      !reminder.title?.trim() ||
      !Number.isFinite(start.getTime()) ||
      !Number.isInteger(reminder.durationMinutes) ||
      reminder.durationMinutes < 5 ||
      reminder.durationMinutes > 1440
    ) {
      throw new Error('Choose a valid reminder title, time and length.');
    }
    const id = `rb${createHash('sha256').update(reminder.id).digest('hex')}`;
    if (eventId && eventId !== id)
      throw new Error('This Google event does not belong to this reminder.');
    const body = {
      summary: `${reminder.completed ? '✓ ' : ''}${reminder.title}`,
      description: `${reminder.details ?? ''}\n\nResearch Buddy reminder · ${reminder.completed ? 'Completed' : 'Pending'}`,
      start: { dateTime: start.toISOString() },
      end: {
        dateTime: new Date(start.getTime() + reminder.durationMinutes * 60_000).toISOString(),
      },
    };
    let response = eventId
      ? await this.authorized(`${eventsUrl}/${id}?sendUpdates=none`, 'PATCH', body)
      : await this.authorized(`${eventsUrl}?sendUpdates=none`, 'POST', { id, ...body });
    if (!eventId && response.status === 409)
      response = await this.authorized(`${eventsUrl}/${id}?sendUpdates=none`, 'PATCH', body);
    this.checkResponse(response);
    const result = await this.json(response);
    if (result.id !== id) throw new Error('Google returned an unexpected event identifier.');
    let htmlLink: string | undefined;
    if (typeof result.htmlLink === 'string') {
      try {
        const link = new URL(result.htmlLink);
        if (
          link.protocol === 'https:' &&
          (link.hostname === 'calendar.google.com' || link.hostname === 'www.google.com')
        )
          htmlLink = link.toString();
      } catch {
        /* An event link is optional. */
      }
    }
    return { eventId: id, ...(htmlLink ? { htmlLink } : {}) };
  }

  private async authorized(url: string, method: string, body: unknown): Promise<Response> {
    if (!this.connected) throw new Error('Connect Google Calendar first.');
    if (this.tokens!.expiresAt <= this.now() + 30_000 && this.tokens!.refreshToken)
      await this.refresh();
    const send = () =>
      this.request(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.tokens!.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    let response = await send();
    if (response.status === 401 && this.tokens?.refreshToken) {
      await this.refresh();
      response = await send();
    }
    return response;
  }

  private async refresh(): Promise<void> {
    const generation = this.generation;
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) throw new Error('Reconnect Google Calendar to continue.');
    const result = await this.exchange({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    if (generation !== this.generation)
      throw new Error('Google connection changed. Please sync again.');
    this.saveTokens(result);
  }

  private async exchange(values: Record<string, string>): Promise<Record<string, unknown>> {
    const form = new URLSearchParams({ ...values, client_id: this.options.credentials.clientId });
    if (this.options.credentials.clientSecret)
      form.set('client_secret', this.options.credentials.clientSecret);
    const response = await this.request(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    this.checkResponse(response);
    return this.json(response);
  }

  private saveTokens(result: Record<string, unknown>): void {
    if (
      typeof result.access_token !== 'string' ||
      !result.access_token ||
      typeof result.expires_in !== 'number' ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in <= 0
    ) {
      throw new Error('Google returned an invalid authorization response.');
    }
    this.tokens = {
      accessToken: result.access_token,
      refreshToken:
        typeof result.refresh_token === 'string' && result.refresh_token
          ? result.refresh_token
          : this.tokens?.refreshToken,
      expiresAt: this.now() + result.expires_in * 1000,
      scope: typeof result.scope === 'string' ? result.scope : this.tokens?.scope,
    };
    this.options.onTokens({ ...this.tokens });
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.requestFetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error('Could not reach Google. Check your connection and try again.');
    }
  }

  private checkResponse(response: Response): void {
    if (response.ok) return;
    if (response.status === 401)
      throw new Error('Google authorization expired. Reconnect Google Calendar.');
    if (response.status === 403)
      throw new Error(
        'Google Calendar access was denied. Check the Calendar API and account permissions.',
      );
    if (response.status === 429 || response.status >= 500)
      throw new Error('Google Calendar is busy or unavailable. Please try again shortly.');
    throw new Error(
      `Google Calendar request failed (HTTP ${response.status}). Reconnect or try again.`,
    );
  }

  private async json(response: Response): Promise<Record<string, unknown>> {
    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      return body as Record<string, unknown>;
    } catch {
      throw new Error('Google returned an invalid response. Please try again.');
    }
  }
}
