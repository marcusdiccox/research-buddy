import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeTestApp } from './helpers/close-app';
let app: ElectronApplication, root: Page, bubble: Page, dir: string;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-new-'));
  app = await _electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, BUDDY_TEST: '1', RESEARCH_BUDDY_DATA_DIR: dir },
  });
  root = await app.firstWindow();
  await root.evaluate(() => window.buddy!.call('showBubble'));
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
test('Today completes recurring reminders and keeps a typed note when switching back', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Keep this draft');
  await root.evaluate(async () => {
    const s = await window.buddy!.call<any>('snapshot');
    await window.buddy!.call('saveReminder', {
      projectId: s.projects[0].id,
      title: 'Daily stretch',
      dueAt: new Date(Date.now() - 60000).toISOString(),
      durationMinutes: 10,
      recurrence: 'daily',
      remindEnabled: false,
    });
  });
  await bubble.getByRole('tab', { name: 'Today', exact: true }).click();
  await expect(bubble.getByRole('button', { name: 'Complete Daily stretch' })).toBeVisible();
  await bubble.getByRole('button', { name: 'Complete Daily stretch' }).click();
  await expect
    .poll(() =>
      root.evaluate(async () => {
        const s = await window.buddy!.call<any>('snapshot');
        return (
          Date.parse(s.reminders.find((r: any) => r.title === 'Daily stretch').dueAt) > Date.now()
        );
      }),
    )
    .toBe(true);
  await expect(bubble.locator('.today-reminder.is-overdue')).toHaveCount(0);
  await bubble.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue('Keep this draft');
});
test('ordinary first opening shows Today once, while explicit Notes opens Notes', async () => {
  await root.evaluate(() => window.buddy!.call('petAction', { action: 'notes' }));
  await expect(bubble.getByRole('tab', { name: 'Today', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await root.evaluate(() => window.buddy!.call('petAction', { action: 'notes' }));
  await expect(bubble.getByRole('tab', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test('No jokes and treat/ball controls reach the live pet without leaving props after hide', async () => {
  await root.evaluate(() => window.buddy!.call('showFoxSettings'));
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#fox-settings'))
        ?.url(),
    )
    .toBeTruthy();
  const settings = app.windows().find((p) => p.url().endsWith('#fox-settings'))!;
  await settings.getByRole('combobox', { name: 'Jokes', exact: true }).selectOption('off');
  await expect
    .poll(() =>
      root.evaluate(async () => (await window.buddy!.call<any>('snapshot')).settings.petJokeStyle),
    )
    .toBe('off');
  const pet = app.windows().find((p) => p.url().endsWith('#pet'))!;
  for (const action of ['treat', 'ball']) {
    await root.evaluate((a) => window.buddy!.call('petAction', { action: a }), action);
    await expect(pet.locator(`.props-${action}`)).toBeAttached();
  }
  await root.evaluate(() => window.buddy!.call('hidePet'));
  await expect(pet.locator('.pet-play-props')).toHaveCount(0);
});
test('capture appends an unsaved note and starts a new draft after saving', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Original draft');
  await app.evaluate(({ clipboard }) => clipboard.writeText('Captured passage'));
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Captured passage');
  await root.evaluate(() => window.buddy!.call('captureCopiedText'));
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Original draft\n\nCaptured passage',
  );
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bubble.getByRole('status')).toContainText('Saved locally');
  await app.evaluate(({ clipboard }) => clipboard.writeText('Separate capture'));
  await root.evaluate(() => window.buddy!.call('captureCopiedText'));
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue('Separate capture');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(() => root.evaluate(async () => (await window.buddy!.call<any>('snapshot')).notes.length))
    .toBe(2);
});
test('capture preserves an unsaved reminder and rejects empty clipboard content', async () => {
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Remember the appointment');
  await app.evaluate(({ clipboard }) => clipboard.writeText('New research'));
  await root.evaluate(() => window.buddy!.call('captureCopiedText'));
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue('New research');
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Remember the appointment',
  );
  await app.evaluate(({ clipboard }) => clipboard.writeText(''));
  await root.evaluate(() => window.buddy!.call('captureCopiedText'));
  await expect(bubble.getByRole('alert')).toContainText('Copy some text');
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Remember the appointment',
  );
});
