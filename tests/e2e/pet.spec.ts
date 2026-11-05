import { closeTestApp } from './helpers/close-app';
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
let app: ElectronApplication, dir: string, notebook: Page, pet: Page;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fox-e2e-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  notebook = await app.firstWindow();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#pet'))
        ?.url(),
    )
    .toBeTruthy();
  pet = app.windows().find((p) => p.url().endsWith('#pet'))!;
  await pet.waitForLoadState('domcontentloaded');
});
test.afterEach(async () => {
  await closeTestApp(app);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
test('the native window and page are truly transparent, showing only a small fox', async () => {
  await expect(pet.getByRole('button', { name: 'Pip the fox — open notepad' })).toBeVisible();
  const colors = await pet.evaluate(() =>
    [document.documentElement, document.body, document.getElementById('root')!].map(
      (e) => getComputedStyle(e).backgroundColor,
    ),
  );
  expect(colors).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('#pet'))!
      .showInactive(),
  );
  // The native compositor can be one frame behind Chromium immediately after show.
  await expect
    .poll(
      () =>
        app
          .evaluate(async ({ BrowserWindow }) => {
            const win = BrowserWindow.getAllWindows().find((w) =>
              w.webContents.getURL().endsWith('#pet'),
            )!;
            const image = await win.webContents.capturePage({ x: 0, y: 0, width: 5, height: 5 });
            return image.toBitmap()[3];
          })
          .catch(() => null),
      { timeout: 10000 },
    )
    .toBe(0);
  await expect(pet.locator('.pet-controls,.pet-drag')).toHaveCount(0);
  await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', 'red');
  await expect(pet.getByRole('menu')).toHaveCount(0);
});
test('fox settings change live and reduced motion turns off animation', async () => {
  await notebook.evaluate(() => window.buddy!.call('showFoxSettings'));
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#fox-settings'))
        ?.url(),
    )
    .toBeTruthy();
  const settingsPage = app.windows().find((p) => p.url().endsWith('#fox-settings'))!;
  await settingsPage.getByLabel('Appearance').selectOption('arctic');
  await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', 'arctic');
  await settingsPage.getByLabel('Roaming').selectOption('parked');
  await settingsPage.getByLabel('Jokes').selectOption('nerdy');
  await expect(settingsPage.getByLabel('How often Pip chats')).toHaveCount(0);
  await settingsPage.getByLabel('Reduced motion').click();
  await expect(settingsPage.getByLabel('Reduced motion')).toBeChecked();
  await expect(pet.locator('.desktop-fox')).toHaveClass(/motion-reduced/);
  expect(await pet.locator('.fox-sprite').evaluate((e) => getComputedStyle(e).animationName)).toBe(
    'none',
  );
  const saved = await notebook.evaluate(() => window.buddy!.call<any>('snapshot'));
  expect(saved.settings).toMatchObject({
    petAppearance: 'arctic',
    petRoamArea: 'parked',
    petJokeStyle: 'nerdy',
    petReducedMotion: true,
  });
  await settingsPage.getByLabel('Appearance').selectOption('midnight');
  await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', 'midnight');
  await settingsPage.getByLabel('Shortcut').selectOption('Control+Shift+Space');
  await expect(pet.getByRole('button', { name: 'Pip the fox — open notepad' })).toHaveAttribute(
    'title',
    /Ctrl \+ Shift \+ Space/,
  );
  await closeTestApp(app);
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  notebook = await app.firstWindow();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#pet'))
        ?.url(),
    )
    .toBeTruthy();
  pet = app.windows().find((p) => p.url().endsWith('#pet'))!;
  await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', 'midnight');
  await expect(pet.locator('.desktop-fox')).toHaveClass(/motion-reduced/);
});
test('the shared shortcut toggles Pip and primary click opens the writing bubble', async () => {
  await notebook.evaluate(() => window.buddy!.call('togglePet'));
  expect(
    (await notebook.evaluate(() => window.buddy!.call<any>('snapshot'))).settings.petVisible,
  ).toBe(false);
  await notebook.evaluate(() => window.buddy!.call('togglePet'));
  await pet.getByRole('button', { name: 'Pip the fox — open notepad' }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#bubble'))
        ?.url(),
    )
    .toBeTruthy();
  const notes = app.windows().find((p) => p.url().endsWith('#bubble'))!;
  await expect(notes.getByRole('tab', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await pet.getByRole('button', { name: 'Pip the fox — open notepad' }).click({ button: 'right' });
  await expect(pet.getByRole('menuitem', { name: /joke/i })).toHaveCount(0);
  await pet.getByRole('menuitem', { name: 'New reminder' }).click();
  await expect(notes.getByRole('tab', { name: 'Reminder', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('closing the fox can be undone with one visibility toggle', async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('#pet'))!
      .close(),
  );
  const settings = await notebook.evaluate(() => window.buddy!.call<any>('snapshot'));
  expect(settings.settings.petVisible).toBe(false);
  await notebook.evaluate(() => window.buddy!.call('togglePet'));
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#pet'))!
        .isVisible(),
    ),
  ).toBe(true);
});
test('hiding Pip saves the current settled position', async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('#pet'))!
      .setPosition(80, 120),
  );
  await notebook.evaluate(() => window.buddy!.call('hidePet'));
  const data = await notebook.evaluate(() => window.buddy!.call<any>('snapshot'));
  expect(data.settings).toMatchObject({ petX: 80, petY: 120 });
});
test('shortcut restoration walks Pip onto the display at a clickable pace', async () => {
  await app.evaluate(({ screen }) => {
    screen.getCursorScreenPoint = () => ({ x: 0, y: 0 });
  });
  await notebook.evaluate(() => window.buddy!.call('hidePet'));
  await notebook.evaluate(() => window.buddy!.call('togglePet'));
  const position = () =>
    app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith('#pet'),
      )!;
      const bounds = win.getBounds(),
        area = screen.getDisplayMatching(bounds).workArea;
      return { x: bounds.x, width: bounds.width, area };
    });
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'walking');
  const start = await position();
  expect(start.x < start.area.x || start.x + start.width > start.area.x + start.area.width).toBe(
    true,
  );
  await expect
    .poll(
      async () => {
        const p = await position();
        return p.x >= p.area.x && p.x + p.width <= p.area.x + p.area.width;
      },
      { timeout: 12000 },
    )
    .toBe(true);
  expect(Math.abs((await position()).width - start.width)).toBeLessThanOrEqual(2);
});
test('the fox paints while unfocused and re-enables background throttling when hidden', async () => {
  const throttled = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#pet'))!
        .webContents.getBackgroundThrottling(),
    );
  expect(await throttled()).toBe(false);
  await notebook.evaluate(() => window.buddy!.call('hidePet'));
  expect(await throttled()).toBe(true);
  await notebook.evaluate(() => window.buddy!.call('showPet'));
  expect(await throttled()).toBe(false);
});

test('pixel fox frames animate, sleep curls up, and reduced motion freezes the sprite', async () => {
  // Accelerate inactivity without incidental desktop cursor activity waking Pip.
  await app.evaluate(({ screen }) => {
    (globalThis as any).__pipRealCursor = screen.getCursorScreenPoint;
    screen.getCursorScreenPoint = () => ({ x: 0, y: 0 });
  });
  // Compare native pixel buffers: cropped PNG screenshots of transparent windows
  // can change edge pixels at Windows display scaling even with animation off.
  const pixels = () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().endsWith('#pet'),
      )!;
      return (await window.webContents.capturePage({ x: 80, y: 172, width: 80, height: 80 }))
        .toBitmap()
        .toString('base64');
    });
  const sprite = pet.locator('.fox-sprite');
  await expect(sprite).toBeVisible();
  await pet.evaluate(() =>
    window.buddy!.call('settings', { petRoamArea: 'parked', petChatter: 'off' }),
  );
  await pet.evaluate(() => window.buddy!.call('showPet'));
  await expect
    .poll(() => sprite.evaluate((e) => getComputedStyle(e).backgroundImage))
    .toContain('data:image/png');
  await app.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 31000;
  });
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'waving');
  const first = await pixels();
  await pet.waitForTimeout(220);
  expect(await pixels()).not.toBe(first);
  await app.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 121000;
  });
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'curling-up');
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'sleeping');
  await app.evaluate(({ screen }) => {
    screen.getCursorScreenPoint = (globalThis as any).__pipRealCursor;
  });
  await pet.getByRole('button', { name: 'Pip the fox — open notepad' }).click();
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'waking-up');
  await expect(pet.getByRole('menuitem', { name: /nap|sleep|wake/i })).toHaveCount(0);
  await pet.evaluate(() => window.buddy!.call('petAction', { action: 'close-menu' }));
  await pet.evaluate(() => window.buddy!.call('settings', { petReducedMotion: true }));
  await expect(pet.locator('.desktop-fox')).toHaveClass(/motion-reduced/);
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'idle');
  expect(await sprite.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  const frozen = await pixels();
  await pet.waitForTimeout(600);
  expect(await pixels()).toBe(frozen);
});

test('all sprite frames keep their paws on the same ground baseline', async () => {
  await expect(pet.locator('.fox')).toHaveAttribute('data-ready', 'true');
  const bottoms = await pet.locator('.fox-sprite').evaluate(async (e) => {
    const image = new Image();
    image.src = getComputedStyle(e).backgroundImage.slice(5, -2);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, 256, 256).data;
    return Array.from({ length: 16 }, (_, i) => {
      let bottom = -1;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++)
          if (data[((Math.floor(i / 4) * 64 + y) * 256 + (i % 4) * 64 + x) * 4 + 3] > 0) bottom = y;
      return bottom;
    });
  });
  expect(new Set(bottoms).size).toBe(1);
  expect(bottoms[0]).toBeGreaterThan(54);
});
