import type { ElectronApplication } from '@playwright/test';
import { spawnSync } from 'node:child_process';
async function within(promise: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Windows can retain the inspector wrapper after a successful Electron quit. */
export async function closeTestApp(application: ElectronApplication | undefined) {
  if (!application) return;
  const child = application.process();
  if (child.exitCode !== null) return;
  let graceful = false;
  const marker = 'PIP_E2E_WILL_QUIT_FLUSHED';
  const observe = (chunk: Buffer) => {
    if (chunk.toString().includes(marker)) graceful = true;
  };
  child.stdout?.on('data', observe);
  try {
    await application.evaluate(({ app }) => {
      if (process.env.BUDDY_TEST !== '1')
        throw new Error('This cleanup is only for isolated test apps.');
      app.once('will-quit', (event) => {
        if (!event.defaultPrevented) process.stdout.write('PIP_E2E_WILL_QUIT_FLUSHED\n');
      });
    });
    const closing = application.close();
    if (await within(closing, 5000)) return;
    const debuggerOnly =
      process.platform === 'win32' && graceful && application.windows().length === 0;
    if (child.pid && child.exitCode === null)
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    await within(
      closing.catch(() => {}),
      3000,
    );
    if (!debuggerOnly)
      throw new Error(
        `Electron did not quit gracefully (will-quit=${graceful}, windows=${application.windows().length}).`,
      );
    console.log('Released Windows inspector wrapper after confirmed graceful app quit.');
  } finally {
    child.stdout?.off('data', observe);
  }
}
