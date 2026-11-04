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
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});
test('the native window and page are truly transparent, showing only a small fox', async () => {
  await expect(pet.getByRole('button', { name: 'Pip the fox — open menu' })).toBeVisible();
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
  await notebook.getByRole('button', { name: 'Settings', exact: true }).click();
  await notebook.getByLabel('Fox appearance').selectOption('arctic');
  await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', 'arctic');
  await notebook.getByLabel('Where Pip roams').selectOption('parked');
  await notebook.getByLabel('Joke style').selectOption('nerdy');
  await notebook.getByLabel('How often Pip chats').selectOption('off');
  await notebook.getByLabel('Reduce motion').check();
  await expect(pet.locator('.desktop-fox')).toHaveClass(/motion-reduced/);
  expect(await pet.locator('.fox-sprite').evaluate((e) => getComputedStyle(e).animationName)).toBe(
    'none',
  );
  const saved = await notebook.evaluate(() => window.buddy!.call<any>('snapshot'));
  expect(saved.settings).toMatchObject({
    petAppearance: 'arctic',
    petRoamArea: 'parked',
    petJokeStyle: 'nerdy',
    petChatter: 'off',
    petReducedMotion: true,
  });
  await notebook.getByLabel('Fox appearance').selectOption('midnight');
  await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', 'midnight');
  await notebook.getByLabel('Show / hide shortcut').selectOption('Control+Shift+Space');
  await expect(pet.getByRole('button', { name: 'Pip the fox — open menu' })).toHaveAttribute(
    'title',
    /Ctrl \+ Shift \+ Space/,
  );
  await app.close();
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
test('the shared shortcut toggle hides and restores the pet and its menu opens a real reminder', async () => {
  await notebook.evaluate(() => window.buddy!.call('togglePet'));
  expect(
    await notebook.evaluate(
      async () => (await window.buddy!.call<any>('snapshot')).settings.petVisible,
    ),
  ).toBe(false);
  await notebook.evaluate(() => window.buddy!.call('togglePet'));
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().endsWith('#pet'))!
        .isVisible(),
    ),
  ).toBe(true);
  await pet.getByRole('button', { name: 'Pip the fox — open menu' }).click();
  await pet.getByRole('menuitem', { name: 'New reminder' }).click();
  await expect(notebook.getByRole('dialog', { name: 'A gentle reminder' })).toBeVisible();
  await notebook.getByRole('button', { name: 'Close dialog' }).click();
  await pet.getByRole('button', { name: 'Pip the fox — open menu' }).click();
  await pet.getByRole('menuitem', { name: 'Tell me a joke' }).click();
  await expect(pet.getByRole('status')).not.toBeEmpty();
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
  const sprite = pet.locator('.fox-sprite');
  await expect(sprite).toBeVisible();
  await pet.evaluate(() =>
    window.buddy!.call('settings', { petRoamArea: 'parked', petChatter: 'off' }),
  );
  await pet.evaluate(() => window.buddy!.call('showPet'));
  await expect
    .poll(() => sprite.evaluate((e) => getComputedStyle(e).backgroundImage))
    .toContain('data:image/png');
  await pet.evaluate(() => window.buddy!.call('petAction', { action: 'joke' }));
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'waving');
  const first = await sprite.screenshot();
  await pet.waitForTimeout(220);
  const next = await sprite.screenshot();
  expect(first.equals(next)).toBe(false);
  await app.evaluate(() => {
    const realNow = Date.now;
    Date.now = () => realNow() + 121000;
  });
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'curling-up');
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'sleeping');
  await pet.getByRole('button', { name: 'Pip the fox — open menu' }).click();
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'waking-up');
  await expect(pet.getByRole('menuitem', { name: /nap|sleep|wake/i })).toHaveCount(0);
  await pet.evaluate(() => window.buddy!.call('petAction', { action: 'close-menu' }));
  await pet.evaluate(() => window.buddy!.call('settings', { petReducedMotion: true }));
  await expect(pet.locator('.desktop-fox')).toHaveClass(/motion-reduced/);
  await expect(pet.locator('.fox')).toHaveAttribute('data-pose', 'idle');
  await pet.waitForTimeout(100); // Allow the native compositor to present the newly frozen pose.
  const frozen = await sprite.screenshot();
  await pet.waitForTimeout(600);
  expect(frozen.equals(await sprite.screenshot())).toBe(true);
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
