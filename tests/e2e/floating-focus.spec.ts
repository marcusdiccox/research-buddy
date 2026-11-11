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
import { closeTestApp } from './helpers/close-app';
let app: ElectronApplication, dir: string, root: Page, bubble: Page;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-focus-window-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, BUDDY_TEST: '1', RESEARCH_BUDDY_DATA_DIR: dir },
  });
  root = await app.firstWindow();
  await root.evaluate(() => window.buddy!.call('showBubble', { action: 'notes' }));
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
  await closeTestApp(app);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
async function start() {
  await bubble.getByRole('button', { name: 'Start focus', exact: true }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#focus'))
        ?.url(),
    )
    .toBeTruthy();
  const timer = app.windows().find((p) => p.url().endsWith('#focus'))!;
  await expect.poll(async () => (await geometry()).visible).toBe(true);
  await expect(timer.getByRole('timer')).toBeVisible();
  return timer;
}
const geometry = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('#focus'))!;
    return {
      bounds: w.getBounds(),
      pinned: w.isAlwaysOnTop(),
      visible: w.isVisible(),
      movable: w.isMovable(),
      size: w.getSize(),
      focused: w.isFocused(),
    };
  });
test('focus opens a small movable pinned card and reveals its pin on hover or keyboard focus', async () => {
  const timer = await start();
  await expect(timer.getByRole('timer')).toContainText('25:');
  const initial = await geometry();
  expect(Math.abs(initial.size[0] - 280)).toBeLessThanOrEqual(2);
  expect(Math.abs(initial.size[1] - 180)).toBeLessThanOrEqual(2);
  expect(initial.pinned).toBe(true);
  expect(initial.movable).toBe(true);
  expect(initial.focused).toBe(false);
  await timer.mouse.move(0, 0);
  const pin = timer.getByRole('button', { name: 'Unpin focus timer' });
  await expect(pin).toHaveCSS('opacity', '0');
  await timer.screenshot({ path: 'test-results/floating-focus-timer-quiet.png', omitBackground: true });
  await timer.locator('.focus-card').hover();
  await expect(pin).toHaveCSS('opacity', '1');
  await pin.click();
  await expect.poll(async () => (await geometry()).pinned).toBe(false);
  await timer.mouse.move(0, 0);
  const unpinned = timer.getByRole('button', { name: 'Pin focus timer' });
  await timer.getByRole('button', { name: 'Hide focus timer' }).focus();
  await timer.keyboard.press('Shift+Tab');
  await expect(unpinned).toHaveCSS('opacity', '1');
  await unpinned.click();
  await expect.poll(async () => (await geometry()).pinned).toBe(true);
  await app.evaluate(({ BrowserWindow }, bounds) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('#focus'))!
      .setPosition(bounds.x - 80, bounds.y + 60);
  }, initial.bounds);
  const moved = await geometry();
  expect(moved.bounds.x).toBe(initial.bounds.x - 80);
  expect(moved.bounds.y).toBe(initial.bounds.y + 60);
  await timer.screenshot({ path: 'test-results/floating-focus-timer.png', omitBackground: true });
});
test('hiding and restoring preserves the countdown and position; stop works from notes', async () => {
  const timer = await start();
  const before = await root.evaluate(() => window.buddy!.call<any>('focusStatus'));
  const position = (await geometry()).bounds;
  await timer.getByRole('button', { name: 'Hide focus timer' }).click();
  await expect.poll(async () => (await geometry()).visible).toBe(false);
  expect((await root.evaluate(() => window.buddy!.call<any>('focusStatus'))).endsAt).toBe(
    before.endsAt,
  );
  await root.evaluate(() => window.buddy!.call('showFocusTimer'));
  await expect.poll(async () => (await geometry()).visible).toBe(true);
  expect((await geometry()).bounds).toEqual(position);
  await root.evaluate(() => window.buddy!.call('focusStop'));
  await expect.poll(async () => (await geometry()).visible).toBe(false);
  expect((await root.evaluate(() => window.buddy!.call<any>('focusStatus'))).active).toBe(false);
});
test('deadline completion leaves a finished card and a fresh session restarts cleanly', async () => {
  const timer = await start();
  await app.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 26 * 60000;
  });
  await expect(timer.getByRole('heading', { name: 'Nice work.' })).toBeVisible();
  await expect(timer.getByRole('timer')).toContainText('00:00');
  expect((await geometry()).visible).toBe(true);
  await timer.getByRole('button', { name: 'Start again' }).click();
  await expect(timer.getByRole('timer')).toContainText('25:');
  expect((await root.evaluate(() => window.buddy!.call<any>('focusStatus'))).active).toBe(true);
});

test('stopping while the new timer opens cannot produce a late popup', async () => {
  const stopped = await root.evaluate(async () => {
    const opening = window.buddy!.call<any>('focusStart', { minutes: 15 });
    await window.buddy!.call('focusStop');
    return opening;
  });
  expect(stopped.active).toBe(false);
  expect((await geometry()).visible).toBe(false);
});

test('the transparent timer keeps painting when unfocused and throttles only while hidden', async () => {
  const timer = await start();
  const throttled = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#focus'))!
        .webContents.getBackgroundThrottling(),
    );
  expect(await throttled()).toBe(false);
  await timer.getByRole('button', { name: 'Hide focus timer' }).click();
  expect(await throttled()).toBe(true);
  await root.evaluate(() => window.buddy!.call('showFocusTimer'));
  expect(await throttled()).toBe(false);
});

test('a quick drag commits its final position even before the polling tick', async () => {
  const timer = await start();
  const initial = (await geometry()).bounds;
  await app.evaluate(({ screen }, bounds) => {
    (globalThis as any).__realFocusCursor = screen.getCursorScreenPoint;
    screen.getCursorScreenPoint = () => ({ x: bounds.x + 20, y: bounds.y + 85 });
  }, initial);
  try {
    await timer.evaluate(() =>
      Promise.all([
        window.buddy!.call('focusDrag', { dragging: true, clientX: 70, clientY: 25 }),
        window.buddy!.call('focusDrag', { dragging: false }),
      ]),
    );
    expect((await geometry()).bounds).toMatchObject({ x: initial.x - 50, y: initial.y + 60 });
  } finally {
    await app.evaluate(({ screen }) => {
      screen.getCursorScreenPoint = (globalThis as any).__realFocusCursor;
    });
  }
});
