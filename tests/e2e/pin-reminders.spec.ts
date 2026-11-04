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
let app: ElectronApplication, root: Page, bubble: Page, dir: string;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-pin-reminders-'));
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
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});
const focusAway = () =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('#'))!;
    w.show();
    w.focus();
  });
const visible = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().endsWith('#bubble'))!
      .isVisible(),
  );
test('unpinning hides on focus loss and retains the draft, while pinning keeps it visible', async () => {
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Keep this draft');
  await focusAway();
  await expect.poll(visible).toBe(false);
  await root.evaluate(() => window.buddy!.call('showBubble'));
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue('Keep this draft');
  await bubble.getByRole('button', { name: 'Pin note', exact: true }).click();
  await expect(bubble.getByRole('button', { name: 'Unpin note', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await focusAway();
  await bubble.waitForTimeout(250);
  expect(await visible()).toBe(true);
  await root.evaluate(() => window.buddy!.call('showBubble'));
  await bubble.getByRole('button', { name: 'Unpin note', exact: true }).click();
  await expect(bubble.getByRole('button', { name: 'Pin note', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await focusAway();
  await expect.poll(visible).toBe(false);
});
test('one Remind checkbox persists without a lead-time selector', async () => {
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  const remind = bubble.getByRole('checkbox', { name: 'Remind me', exact: true });
  await expect(remind).toBeChecked();
  await remind.uncheck();
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Silent appointment');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bubble.getByRole('status')).toContainText('Saved');
  const reminders = await bubble.evaluate(
    async () => (await window.buddy!.call<any>('snapshot')).reminders,
  );
  expect(reminders[0].remindEnabled).toBe(false);
  await expect(bubble.getByRole('combobox')).toHaveCount(0);
});

test('upcoming reminders reach Pip and the editor without replacing the draft', async () => {
  await root.evaluate(() => window.buddy!.call('showPet'));
  await bubble.getByRole('tab', { name: 'Reminder', exact: true }).click();
  const due = new Date(Date.now() + 31 * 60000);
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await bubble.getByLabel('Date and time').fill(local);
  await bubble.getByRole('textbox', { name: 'Note text' }).fill('Upcoming appointment');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bubble.getByRole('alert')).toContainText('Upcoming appointment is due in');
  await expect(bubble.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Upcoming appointment',
  );
  await expect
    .poll(async () => (await root.evaluate(() => window.buddy!.call<any>('petState'))).phrase)
    .toContain('Upcoming appointment is due in');
  await bubble.screenshot({ path: 'test-results/upcoming-reminder-bubble.png' });
});

const advanceClock = async (milliseconds: number) =>
  app.evaluate((_electron, amount) => {
    const now = Date.now;
    Date.now = () => now() + amount;
  }, milliseconds);

test('foreground-only alerts each get a readable slot', async () => {
  await root.evaluate(async () => {
    await window.buddy!.call('settings', { petVisible: false, notifications: false });
    await window.buddy!.call('showWorkspace');
    const dueAt = new Date(Date.now() + 31 * 60000).toISOString();
    await window.buddy!.call('saveReminder', {
      title: 'First warning',
      dueAt,
      durationMinutes: 30,
    });
    await window.buddy!.call('saveReminder', {
      title: 'Second warning',
      dueAt,
      durationMinutes: 30,
    });
  });
  expect((await root.evaluate(() => window.buddy!.call<any>('snapshot'))).settings.petVisible).toBe(
    false,
  );
  await expect(root.locator('.toast')).toContainText('First warning');
  await bubble.waitForTimeout(400);
  await expect(root.locator('.toast')).toContainText('First warning');
  await advanceClock(12000);
  await expect(root.locator('.toast')).toContainText('Second warning');
});

test('a cancelled queued reminder never speaks and the menu cannot cover an alert', async () => {
  await root.evaluate(() => window.buddy!.call('showPet'));
  const pet = app.windows().find((page) => page.url().endsWith('#pet'))!;
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.getURL().endsWith('#pet')) window.hide();
    }
  });
  await root.evaluate(async () => {
    await window.buddy!.call('settings', { notifications: false });
    await window.buddy!.call('petAction', { action: 'menu' });
    const dueAt = new Date(Date.now() + 31 * 60000).toISOString();
    await window.buddy!.call('saveReminder', { title: 'Menu warning', dueAt, durationMinutes: 30 });
  });
  await expect(pet.getByRole('menu')).toBeVisible();
  await pet.waitForTimeout(300);
  expect(
    (await root.evaluate(() => window.buddy!.call<any>('petState'))).phrase ?? '',
  ).not.toContain('Menu warning');
  expect(
    (await root.evaluate(() => window.buddy!.call<any>('snapshot'))).reminders[0].notifiedAt,
  ).toBeNull();
  await root.evaluate(() => window.buddy!.call('petAction', { action: 'close-menu' }));
  await expect(pet.getByRole('status')).toContainText('Menu warning');
  await root.evaluate(async () => {
    const dueAt = new Date(Date.now() + 31 * 60000).toISOString();
    const cancelled = await window.buddy!.call<any>('saveReminder', {
      title: 'Cancelled warning',
      dueAt,
      durationMinutes: 30,
    });
    await window.buddy!.call('saveReminder', { ...cancelled, remindEnabled: false });
  });
  await advanceClock(13000);
  await pet.waitForTimeout(400);
  expect(
    (await root.evaluate(() => window.buddy!.call<any>('petState'))).phrase ?? '',
  ).not.toContain('Cancelled warning');
});
