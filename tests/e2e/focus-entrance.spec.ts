import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeTestApp } from './helpers/close-app';
test('Pip restores fully onscreen during a quiet focus session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pip-focus-entry-'));
  const app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  try {
    const root = await app.firstWindow();
    await expect
      .poll(() =>
        app
          .windows()
          .find((p) => p.url().endsWith('#pet'))
          ?.url(),
      )
      .toBeTruthy();
    await root.evaluate(async () => {
      await window.buddy!.call('focusStart', { minutes: 25 });
      await window.buddy!.call('hidePet');
      await window.buddy!.call('togglePet');
    });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow, screen }) => {
          const w = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().endsWith('#pet'),
          )!;
          const b = w.getBounds(),
            a = screen.getDisplayMatching(b).workArea;
          return (
            w.isVisible() &&
            b.x >= a.x &&
            b.y >= a.y &&
            b.x + b.width <= a.x + a.width &&
            b.y + b.height <= a.y + a.height
          );
        }),
      )
      .toBe(true);
  } finally {
    await closeTestApp(app);
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
