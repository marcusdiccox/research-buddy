import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let app: ElectronApplication, dir: string, workspace: Page, bubble: Page;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-bubble-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  workspace = await app.firstWindow();
  await workspace.evaluate(() => window.buddy!.call('showBubble'));
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#bubble'))
        ?.url(),
    )
    .toBeTruthy();
  bubble = app.windows().find((p) => p.url().endsWith('#bubble'))!;
});
test.afterEach(async () => {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});
test('the writing bubble is frameless, transparent and keeps a real note when expanded', async () => {
  const native = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().endsWith('#bubble'),
    )!;
    return {
      frame: w.isResizable(),
      transparent: w.getBackgroundColor(),
      bounds: w.getBounds(),
      content: w.getContentBounds(),
    };
  });
  expect(native.frame).toBe(false);
  // Electron's color getter normalizes away alpha on Windows; verify pixels.
  await expect
    .poll(
      () =>
        app
          .evaluate(async ({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows().find((w) =>
              w.webContents.getURL().endsWith('#bubble'),
            )!;
            const image = await w.webContents.capturePage({ x: 0, y: 0, width: 4, height: 4 });
            return image.toBitmap()[3];
          })
          .catch(() => null),
      { timeout: 10000 },
    )
    .toBe(0);
  expect(native.bounds.height - native.content.height).toBeLessThan(10);
  expect(native.bounds.width).toBeLessThan(370);
  expect(
    await bubble.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
  ).toBe('rgba(0, 0, 0, 0)');
  await bubble
    .getByRole('textbox', { name: 'Note text' })
    .fill('A quick thought\nKeep this in my notebook.');
  await bubble.getByRole('button', { name: 'Open notebook' }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  const pad = app.windows().find((p) => p.url().endsWith('#notepad'))!;
  await expect(pad.getByLabel('Note text', { exact: true })).toHaveValue(
    'A quick thought\nKeep this in my notebook.',
  );
  const notes = await pad.evaluate(async () => (await window.buddy!.call<any>('snapshot')).notes);
  expect(notes).toHaveLength(1);
});
test('closing preserves the writing draft and reminder mode uses the same text', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Call the library');
  await bubble.getByRole('button', { name: 'Close' }).click();
  await workspace.evaluate(() => window.buddy!.call('showBubble'));
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue('Call the library');
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await bubble.getByLabel('Date and time').fill('2030-11-09T15:00');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  const reminders = await bubble.evaluate(
    async () => (await window.buddy!.call<any>('snapshot')).reminders,
  );
  expect(reminders).toHaveLength(1);
  expect(reminders[0].title).toBe('Call the library');
});
test('initial calendar mode survives the renderer loading after its launch event', async () => {
  await workspace.evaluate(() => window.buddy!.call('showBubble', { action: 'calendar' }));
  await expect(bubble.getByRole('tab', { name: 'Calendar', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await bubble.reload();
  await expect(bubble.getByRole('tab', { name: 'Calendar', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test('expanding the bubble again preserves an unsaved notebook edit', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Saved first draft');
  await bubble.getByRole('button', { name: 'Open notebook' }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  const pad = app.windows().find((p) => p.url().endsWith('#notepad'))!;
  await pad.getByLabel('Note text', { exact: true }).fill('Unsaved notebook edit');
  await workspace.evaluate(() => window.buddy!.call('showBubble'));
  await bubble.getByRole('button', { name: 'Open notebook' }).click();
  await expect(pad.getByLabel('Note text', { exact: true })).toHaveValue('Unsaved notebook edit');
});
test('re-expansion keeps a custom notebook title', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('An ordinary body');
  await bubble.getByRole('button', { name: 'Open notebook' }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  const pad = app.windows().find((p) => p.url().endsWith('#notepad'))!;
  await pad.getByLabel('Note title', { exact: true }).fill('My custom title');
  await pad.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(pad.getByRole('status')).toContainText('Note saved');
  await workspace.evaluate(() => window.buddy!.call('showBubble'));
  await bubble.getByRole('button', { name: 'Open notebook' }).click();
  await expect(pad.getByLabel('Note title', { exact: true })).toHaveValue('My custom title');
});
test('Pip stays still while the writing bubble is open', async () => {
  await workspace.evaluate(() => window.buddy!.call('showPet'));
  const position = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#pet'))!
        .getPosition(),
    );
  const before = await position();
  await app.evaluate(() => {
    const real = Date.now;
    Date.now = () => real() + 10000;
  });
  await bubble.waitForTimeout(1300);
  expect(await position()).toEqual(before);
});
test('expansion follows the displayed text after switching saved note kinds', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Original note');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bubble.getByRole('status')).toContainText('Saved');
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await bubble.getByLabel('Date and time').fill('2030-11-09T15:00');
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Current shared thought');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bubble.getByRole('status')).toContainText('Saved');
  await bubble.getByRole('button', { name: 'Close', exact: true }).click();
  await workspace.evaluate(() => window.buddy!.call('showBubble'));
  await bubble.getByRole('button', { name: 'Open notebook' }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  const pad = app.windows().find((p) => p.url().endsWith('#notepad'))!;
  await expect(pad.getByLabel('Note text', { exact: true })).toHaveValue('Current shared thought');
});
