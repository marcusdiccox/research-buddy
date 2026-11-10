import type { AppUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/contracts.js';

type Adapter = Pick<
  AppUpdater,
  | 'on'
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'allowDowngrade'
  | 'disableWebInstaller'
  | 'checkForUpdates'
>;

/** The feed is generated from package.json; renderer calls cannot supply a URL. */
export class UpdateController {
  private value: UpdateStatus;
  private pending: Promise<UpdateStatus> | undefined;
  constructor(
    private adapter: Adapter,
    private options: {
      enabled: boolean;
      currentVersion: string;
      onChange: () => void;
    },
  ) {
    this.value = {
      phase: options.enabled ? 'idle' : 'unsupported',
      currentVersion: options.currentVersion,
    };
    adapter.autoDownload = options.enabled;
    adapter.autoInstallOnAppQuit = options.enabled;
    adapter.allowPrerelease = false;
    adapter.allowDowngrade = false;
    adapter.disableWebInstaller = true;
    if (!options.enabled) return;
    adapter.on('checking-for-update', () => this.set({ phase: 'checking' }));
    adapter.on('update-not-available', () =>
      this.set({ phase: 'current', version: undefined, percent: undefined }),
    );
    adapter.on('update-available', (info) =>
      this.set({ phase: 'available', version: info.version, percent: undefined }),
    );
    adapter.on('download-progress', (info) =>
      this.set({
        phase: 'downloading',
        percent: Math.max(0, Math.min(100, Math.round(info.percent))),
      }),
    );
    adapter.on('update-downloaded', (info) =>
      this.set({ phase: 'ready', version: info.version, percent: 100 }),
    );
    adapter.on('error', () => this.fail());
  }
  get status(): UpdateStatus {
    return { ...this.value };
  }
  private set(patch: Partial<UpdateStatus>) {
    if (this.value.phase === 'ready' && patch.phase !== 'ready') return;
    const next = { ...this.value, message: undefined, ...patch };
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    this.value = next;
    this.options.onChange();
  }
  private fail() {
    this.set({ phase: 'error', message: 'Could not check updates. Try again later.' });
  }
  check(): Promise<UpdateStatus> {
    if (!this.options.enabled || ['ready', 'downloading', 'available'].includes(this.value.phase))
      return Promise.resolve(this.status);
    if (this.pending) return this.pending;
    this.set({ phase: 'checking' });
    try {
      this.pending = this.adapter
        .checkForUpdates()
        .then(async (result) => {
          // Availability and automatic download have separate promises in electron-updater.
          // Consume both; its error event alone does not handle a rejected download.
          await result?.downloadPromise;
          return this.status;
        })
        .catch(() => {
          this.fail();
          return this.status;
        })
        .finally(() => {
          this.pending = undefined;
        });
      return this.pending;
    } catch {
      this.fail();
      return Promise.resolve(this.status);
    }
  }
  /** Do not launch an NSIS installer while Windows is terminating its processes. */
  deferForSystemShutdown() {
    this.adapter.autoInstallOnAppQuit = false;
  }
}
