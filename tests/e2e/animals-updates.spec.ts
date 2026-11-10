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
let app: ElectronApplication, dir: string, pet: Page, settings: Page;
const launch = () =>
  electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, BUDDY_TEST: '1', RESEARCH_BUDDY_DATA_DIR: dir },
  });
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-animals-'));
  app = await launch();
  const main = await app.firstWindow();
  await main.evaluate(() => window.buddy!.call('showPet'));
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#pet'))
        ?.url(),
    )
    .toBeTruthy();
  pet = app.windows().find((p) => p.url().endsWith('#pet'))!;
  await main.evaluate(() => window.buddy!.call('settings', { petRoamArea: 'parked' }));
  await main.evaluate(() => window.buddy!.call('showFoxSettings'));
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#fox-settings'))
        ?.url(),
    )
    .toBeTruthy();
  settings = app.windows().find((p) => p.url().endsWith('#fox-settings'))!;
});
test.afterEach(async () => {
  await closeTestApp(app);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('animal choices render, play differently and persist without growing settings', async () => {
  for (const species of ['red-panda', 'otter']) {
    await settings.getByLabel('Animal').selectOption(species);
    await expect(settings.getByRole('status')).toHaveText('Saved');
    await expect(pet.locator('.fox')).toHaveAttribute('data-species', species);
    await expect(pet.locator('.fox')).toHaveAttribute('data-ready', 'true');
    await pet.evaluate(() => window.buddy!.call('petAction', { action: 'menu' }));
    await pet
      .getByRole('menuitem', { name: species === 'otter' ? 'Float a little' : 'Tail hug' })
      .click();
    await expect(pet.locator('.fox')).toHaveAttribute(
      'data-pose',
      species === 'otter' ? 'floating' : 'waving',
    );
  }
  expect(await settings.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  expect(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  const saved = await settings.evaluate(() => window.buddy!.call<any>('snapshot'));
  expect(saved.settings.petSpecies).toBe('otter');
  await closeTestApp(app);
  app = await launch();
  const main = await app.firstWindow();
  expect((await main.evaluate(() => window.buddy!.call<any>('snapshot'))).settings.petSpecies).toBe(
    'otter',
  );
  await expect.poll(() => app.windows().some((p) => p.url().endsWith('#pet'))).toBe(true);
});

test('update controls stay offline and never install in an isolated test profile', async () => {
  await settings.getByRole('button', { name: 'Check for updates' }).click();
  await expect(settings.getByRole('alert')).toHaveCount(0);
  const status = await settings.evaluate(() => window.buddy!.call<any>('checkForUpdates'));
  expect(status.phase).toBe('unsupported');
});

test('Animal and Appearance are independent and all nine combinations have working colors', async () => {
  await settings.getByLabel('Appearance').selectOption('arctic');
  await expect(settings.getByRole('status')).toHaveText('Saved');
  for (const species of ['fox', 'red-panda', 'otter']) {
    await settings.getByLabel('Animal').selectOption(species);
    await expect(settings.getByRole('status')).toHaveText('Saved');
    await expect(settings.getByLabel('Appearance')).toHaveValue('arctic');
    const palettes = new Set<string>();
    for (const appearance of ['red', 'midnight', 'arctic']) {
      await settings.getByLabel('Appearance').selectOption(appearance);
      await expect(settings.getByRole('status')).toHaveText('Saved');
      await expect(pet.locator('.fox')).toHaveAttribute('data-species', species);
      await expect(pet.locator('.fox')).toHaveAttribute('data-appearance', appearance);
      await expect(pet.locator('.fox')).toHaveAttribute('data-ready', 'true');
      const image = await pet
        .locator('.fox-sprite')
        .evaluate((e) => getComputedStyle(e).backgroundImage);
      expect(image).toContain('data:image/png');
      palettes.add(image);
    }
    expect(palettes.size).toBe(3);
  }
  expect(await settings.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await settings.screenshot({ path: 'test-results/animal-settings.png' });
  await pet
    .locator('.fox-pet-button')
    .screenshot({ path: 'test-results/otter-arctic.png', omitBackground: true });
});

test('both generated atlas sets and the swimming sheet contain aligned opaque characters', async () => {
  for (const species of ['red-panda', 'otter']) {
    await settings.getByLabel('Animal').selectOption(species);
    await expect(settings.getByRole('status')).toHaveText('Saved');
    await expect(pet.locator('.fox')).toHaveAttribute('data-species', species);
    await expect(pet.locator('.fox')).toHaveAttribute('data-ready', 'true');
    for (const pose of species === 'otter'
      ? ['idle', 'standing-up', 'swimming']
      : ['idle', 'standing-up']) {
      const view = await pet.evaluate(() => window.buddy!.call<any>('petState'));
      await app.evaluate(
        ({ BrowserWindow }, state) => {
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().endsWith('#pet'))!
            .webContents.send('pet:state', state);
        },
        { ...view, pose },
      );
      await expect(pet.locator('.fox')).toHaveAttribute('data-pose', pose);
      const frames = await pet.locator('.fox-sprite').evaluate(async (e) => {
        const image = new Image();
        image.src = getComputedStyle(e).backgroundImage.slice(5, -2);
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 256, 256).data;
        return Array.from({ length: 16 }, (_, cell) => {
          let count = 0,
            bottom = -1;
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++)
              if (pixels[((Math.floor(cell / 4) * 64 + y) * 256 + (cell % 4) * 64 + x) * 4 + 3]) {
                count++;
                bottom = y;
              }
          return { count, bottom };
        });
      });
      expect(frames.every((frame) => frame.count > 100)).toBe(true);
      expect(new Set(frames.map((frame) => frame.bottom)).size).toBe(1);
      expect(frames[0].bottom).toBe(60);
    }
  }
});
