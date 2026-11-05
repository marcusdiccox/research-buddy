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
import { chooseDateTime } from './helpers/date-time';
let app: ElectronApplication, root: Page, bubble: Page, dir: string;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-routines-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
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
test('repeat persists from the bubble and completion advances the same reminder', async () => {
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await chooseDateTime(bubble, '2030-11-09T15:30');
  await bubble.getByLabel('Repeat', { exact: true }).selectOption('daily');
  await bubble.getByLabel('Note text', { exact: true }).fill('Daily reading');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  const original = (await root.evaluate(() => window.buddy!.call<any>('snapshot'))).reminders[0];
  expect(original.recurrence).toBe('daily');
  await root.evaluate(
    (id) => window.buddy!.call('showNotepad', { action: 'reminder', reminderId: id }),
    original.id,
  );
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  const pad = app.windows().find((p) => p.url().endsWith('#notepad'))!;
  await expect(pad.getByLabel('Repeat', { exact: true })).toHaveValue('daily');
  await pad.getByRole('button', { name: 'Mark done', exact: true }).click();
  const next = (await root.evaluate(() => window.buddy!.call<any>('snapshot'))).reminders[0];
  expect(next.id).toBe(original.id);
  expect(next.completed).toBe(false);
  expect(Date.parse(next.dueAt)).toBeGreaterThan(Date.parse(original.dueAt));
});
test('natural date entry previews before applying', async () => {
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  await bubble.getByRole('button', { name: 'Date and time', exact: true }).click();
  const picker = bubble.getByRole('dialog', { name: 'Date and time', exact: true });
  await picker.getByLabel('Describe a date', { exact: true }).fill('tomorrow at 5pm');
  await picker.getByRole('button', { name: 'Preview date', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Use date', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Use date', exact: true }).click();
  await expect(picker.getByLabel('Time', { exact: true })).toHaveValue('17:00');
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
});
test('focus can start, stay quiet, and stop from the bubble', async () => {
  await root.evaluate(() => window.buddy!.call('showPet'));
  await bubble.getByRole('button', { name: 'Start focus', exact: true }).click();
  await expect(bubble.getByRole('button', { name: 'Stop focus', exact: true })).toBeVisible();
  expect((await root.evaluate(() => window.buddy!.call<any>('focusStatus'))).active).toBe(true);
  await app.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 31000;
  });
  await bubble.waitForTimeout(200);
  expect((await root.evaluate(() => window.buddy!.call<any>('petState'))).phrase).toBeNull();
  await root.evaluate(() =>
    window.buddy!.call('saveReminder', {
      title: 'Important during focus',
      dueAt: new Date(Date.now() + 31 * 60000).toISOString(),
      durationMinutes: 30,
    }),
  );
  await expect
    .poll(async () => (await root.evaluate(() => window.buddy!.call<any>('petState'))).phrase)
    .toContain('Important during focus');
  expect((await root.evaluate(() => window.buddy!.call<any>('focusStatus'))).active).toBe(true);
  await bubble.getByRole('button', { name: 'Stop focus', exact: true }).click();
  expect((await root.evaluate(() => window.buddy!.call<any>('focusStatus'))).active).toBe(false);
});
