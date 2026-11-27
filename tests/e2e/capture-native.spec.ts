import { test, expect, _electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeTestApp } from './helpers/close-app';
test('native selection capture copies fictional Unicode text and rejects an unchanged clipboard', async () => {
  test.skip(
    process.platform !== 'win32',
    'macOS selected-text capture requires user-granted Accessibility; copied-text flow is tested separately.',
  );
  let app: ElectronApplication | undefined;
  const dir = mkdtempSync(join(tmpdir(), 'pip-native-'));
  try {
    app = await _electron.launch({
      executablePath: process.env.BUDDY_EXECUTABLE,
      args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
      env: { ...process.env, BUDDY_TEST: '1', RESEARCH_BUDDY_DATA_DIR: dir },
    });
    await app.firstWindow();
    await app.evaluate(async ({ app, BrowserWindow }) => {
      const load = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const { SelectionCapture } = load(app.getAppPath() + '/dist-electron/main/capture.js');
      (globalThis as any).__pipNativeCapture = new SelectionCapture(app.getAppPath() + '/assets');
      const w = new BrowserWindow({ width: 400, height: 200, show: true });
      await w.loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(
            '<textarea aria-label="Capture scratch">Fictional research 🦊 café</textarea><button>Nothing selected</button>',
          ),
      );
      (globalThis as any).__pipScratch = w;
    });
    await expect
      .poll(() => app!.evaluate(() => !!(globalThis as any).__pipNativeCapture.available), {
        timeout: 10000,
      })
      .toBe(true);
    await app.evaluate(async () => {
      const w = (globalThis as any).__pipScratch;
      w.show();
      w.focus();
      await w.webContents.executeJavaScript(
        'document.querySelector("textarea").focus();document.querySelector("textarea").select()',
      );
    });
    const result = await app.evaluate(() => (globalThis as any).__pipNativeCapture.capture());
    expect(result).toEqual({ text: 'Fictional research 🦊 café' });
    await app.evaluate(async () => {
      const w = (globalThis as any).__pipScratch;
      w.focus();
      await w.webContents.executeJavaScript(
        'document.querySelector("button").focus();getSelection().removeAllRanges()',
      );
    });
    const empty = await app.evaluate(() => (globalThis as any).__pipNativeCapture.capture());
    expect(empty.text).toBeUndefined();
    expect(empty.error).toBeTruthy();
  } finally {
    if (app) {
      await app.evaluate(() => (globalThis as any).__pipNativeCapture?.dispose()).catch(() => {});
      await closeTestApp(app);
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
