import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { UpdateController } from '../src/main/updates';

class Feed extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  allowDowngrade = true;
  disableWebInstaller = false;
  checks = 0;
  work: () => Promise<unknown> = async () => null;
  async checkForUpdates() {
    this.checks++;
    return this.work();
  }
}
function fixture(enabled = true) {
  const feed = new Feed();
  const controller = new UpdateController(feed, {
    enabled,
    currentVersion: '0.9.0',
    onChange: () => {},
  });
  return { feed, controller };
}
describe('GitHub release updates', () => {
  it('enables stable automatic downloads and install-on-quit without downgrades', () => {
    const { feed, controller } = fixture();
    expect(controller.status.phase).toBe('idle');
    expect(feed.autoDownload).toBe(true);
    expect(feed.autoInstallOnAppQuit).toBe(true);
    expect(feed.allowPrerelease).toBe(false);
    expect(feed.allowDowngrade).toBe(false);
    expect(feed.disableWebInstaller).toBe(true);
  });
  it('never reads a feed or enables installation for development/unpacked/test apps', async () => {
    const { feed, controller } = fixture(false);
    await controller.check();
    expect(controller.status.phase).toBe('unsupported');
    expect(feed.checks).toBe(0);
    expect(feed.autoDownload).toBe(false);
    expect(feed.autoInstallOnAppQuit).toBe(false);
  });
  it('tracks availability, download progress and a downloaded update', async () => {
    const { feed, controller } = fixture();
    feed.emit('checking-for-update');
    expect(controller.status.phase).toBe('checking');
    feed.emit('update-available', { version: '0.9.1' });
    feed.emit('download-progress', { percent: 41.8 });
    expect(controller.status).toMatchObject({
      phase: 'downloading',
      version: '0.9.1',
      percent: 42,
    });
    feed.emit('update-downloaded', { version: '0.9.1' });
    await controller.check();
    feed.emit('update-not-available', { version: '0.9.0' });
    expect(controller.status).toMatchObject({ phase: 'ready', version: '0.9.1' });
    expect(feed.checks).toBe(0);
  });
  it('coalesces concurrent checks and keeps offline errors nonfatal', async () => {
    const { feed, controller } = fixture();
    let release!: () => void;
    feed.work = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const first = controller.check();
    const second = controller.check();
    expect(feed.checks).toBe(1);
    release();
    await Promise.all([first, second]);
    feed.work = async () => {
      throw new Error('offline');
    };
    await expect(controller.check()).resolves.toMatchObject({ phase: 'error' });
    feed.work = async () => {
      feed.emit('update-not-available', { version: '0.9.0' });
    };
    await controller.check();
    expect(controller.status.phase).toBe('current');
  });
  it('does not erase a downloaded update when an error arrives later', () => {
    const { feed, controller } = fixture();
    feed.emit('update-downloaded', { version: '0.9.1' });
    feed.emit('error', new Error('late request failed'));
    expect(controller.status.phase).toBe('ready');
  });
  it('defers installation during Windows shutdown without blocking shutdown', () => {
    const { feed, controller } = fixture();
    controller.deferForSystemShutdown();
    expect(feed.autoInstallOnAppQuit).toBe(false);
  });
  it('handles a rejected automatic download promise as well as its error event', async () => {
    const { feed, controller } = fixture();
    let rejectDownload!: (error: Error) => void;
    const downloadPromise = new Promise<string[]>((_resolve, reject) => {
      rejectDownload = reject;
    });
    feed.work = async () => ({ updateInfo: { version: '0.9.1' }, downloadPromise });
    let finished = false;
    const check = controller.check().then((status) => {
      finished = true;
      return status;
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(finished).toBe(false);
    feed.emit('error', new Error('download failed'));
    rejectDownload(new Error('download failed'));
    await expect(check).resolves.toMatchObject({ phase: 'error' });
  });
});
