import { closeTestApp } from './helpers/close-app';
import { chooseDateTime } from './helpers/date-time';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication, dir: string, workspace: Page, notepad: Page;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'compact-e2e-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  workspace = await app.firstWindow();
  await workspace.evaluate(() => window.buddy!.call('showNotepad'));
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().includes('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  notepad = app.windows().find((p) => p.url().includes('#notepad'))!;
  const geometry = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().endsWith('#notepad'),
    )!;
    return { size: win.getSize(), minimum: win.getMinimumSize() };
  });
  expect(Math.abs(geometry.size[0] - 520)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.size[1] - 600)).toBeLessThanOrEqual(2);
  expect(geometry.minimum).toEqual([420, 480]);
  await expect(notepad.getByRole('tab', { name: 'Notes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test.afterEach(async () => {
  await closeTestApp(app);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('notes persist and an unsaved draft survives switching modes and navigation', async () => {
  await notepad.getByLabel('Note title', { exact: true }).fill('Small notebook');
  await notepad.getByLabel('Note text', { exact: true }).fill('A real persisted note.');
  await notepad.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(notepad.getByRole('status')).toContainText('Note saved');
  await notepad.getByLabel('Note text', { exact: true }).fill('Unsaved thought stays here.');
  await notepad.getByRole('tab', { name: 'Reminders', exact: true }).click();
  await notepad.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await notepad.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(notepad.getByLabel('Note text', { exact: true })).toHaveValue(
    'Unsaved thought stays here.',
  );
  await workspace.evaluate(() => window.buddy!.call('showNotepad', { action: 'reminder' }));
  await expect(notepad.getByRole('tab', { name: 'Reminders', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await notepad.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(notepad.getByLabel('Note text', { exact: true })).toHaveValue(
    'Unsaved thought stays here.',
  );
  await notepad.reload();
  await notepad.getByRole('tab', { name: 'Notes', exact: true }).click();
  await notepad.getByRole('button', { name: 'Saved items', exact: true }).click();
  await notepad.getByRole('button', { name: 'Open note Small notebook', exact: true }).click();
  await expect(notepad.getByLabel('Note text', { exact: true })).toHaveValue(
    'A real persisted note.',
  );
  expect(await notepad.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('reminders save and edit the same real calendar event without implying a Google connection', async () => {
  await notepad.getByRole('tab', { name: 'Reminders', exact: true }).click();
  await notepad.getByLabel('Reminder title', { exact: true }).fill('Walk with Pip');
  await notepad.getByLabel('Details', { exact: true }).fill('A little break');
  await chooseDateTime(notepad, '2030-11-06T15:30');
  await notepad.getByRole('button', { name: 'Save reminder', exact: true }).click();
  await expect(notepad.getByRole('status')).toContainText('Reminder saved');
  await notepad.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await expect(
    notepad.getByText('Google Calendar is not connected.', { exact: true }),
  ).toBeVisible();
  await expect(notepad.getByRole('button', { name: 'Import Google credentials' })).toBeVisible();
  await expect(
    notepad.getByRole('button', { name: 'Connect Google Calendar', exact: true }),
  ).toBeDisabled();
  await notepad.getByLabel('Sync this reminder to Google Calendar').check();
  await notepad.getByRole('button', { name: 'Save reminder', exact: true }).click();
  const saved = await notepad.evaluate(
    async () => (await window.buddy!.call<any>('snapshot')).reminders,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    title: 'Walk with Pip',
    details: 'A little break',
    calendarSync: true,
  });
  await expect(notepad.getByRole('button', { name: 'Open Google event draft' })).toBeVisible();
  await notepad.getByRole('button', { name: 'New reminder', exact: true }).click();
  await notepad.getByRole('button', { name: 'Saved items', exact: true }).click();
  await notepad.getByRole('button', { name: 'Open reminder Walk with Pip', exact: true }).click();
  await expect(notepad.getByLabel('Reminder title', { exact: true })).toHaveValue('Walk with Pip');
});

test('a failed save keeps the typed note and recovery saves it successfully', async () => {
  await notepad.getByLabel('Note title', { exact: true }).fill('   ');
  await notepad
    .getByLabel('Note text', { exact: true })
    .fill('This thought must survive a rejected save.');
  await notepad.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(notepad.getByRole('alert')).toBeVisible();
  await expect(notepad.getByLabel('Note text', { exact: true })).toHaveValue(
    'This thought must survive a rejected save.',
  );
  await notepad.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await notepad.getByRole('tab', { name: 'Notes', exact: true }).click();
  await notepad.getByLabel('Note title', { exact: true }).fill('Recovered draft');
  await notepad.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(notepad.getByRole('status')).toContainText('Note saved');
  const saved = await notepad.evaluate(
    async () => (await window.buddy!.call<any>('snapshot')).notes,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].body).toBe('This thought must survive a rejected save.');
});

test('settings open separately with working fox controls and fit their compact window', async () => {
  await notepad.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#fox-settings'))
        ?.url(),
    )
    .toBeTruthy();
  const settings = app.windows().find((p) => p.url().endsWith('#fox-settings'))!;
  const geometry = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().endsWith('#fox-settings'),
    )!;
    return { size: win.getSize(), minimum: win.getMinimumSize() };
  });
  expect(Math.abs(geometry.size[0] - 340)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.size[1] - 400)).toBeLessThanOrEqual(2);

  await settings.getByLabel('Appearance').selectOption('arctic');
  await expect
    .poll(
      async () =>
        (await settings.evaluate(() => window.buddy!.call<any>('snapshot'))).settings.petAppearance,
    )
    .toBe('arctic');
  await expect(settings.getByLabel('How often Pip chats')).toHaveCount(0);
  await expect(settings.locator('.sidebar')).toHaveCount(0);
  await expect(settings.locator('.fox-settings-preview,.fox-choice-description')).toHaveCount(0);
  expect(await settings.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('Google approval can be cancelled while the connection is pending', async () => {
  const filePath = join(dir, 'test-desktop-client.json');
  writeFileSync(
    filePath,
    JSON.stringify({
      installed: { client_id: 'test.apps.googleusercontent.com', client_secret: 'test-only' },
    }),
    'utf8',
  );
  await app.evaluate(({ dialog, shell }, path) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [path],
    })) as typeof dialog.showOpenDialog;
    // Keep the real local authorization lifecycle, while preventing an external browser in this isolated test.
    shell.openExternal = async () => {};
  }, filePath);
  await notepad.getByRole('tab', { name: 'Calendar', exact: true }).click();
  await notepad.getByRole('button', { name: 'Import Google credentials' }).click();
  await expect(
    notepad.getByRole('button', { name: 'Connect Google Calendar', exact: true }),
  ).toBeEnabled();
  await notepad.getByRole('button', { name: 'Connect Google Calendar', exact: true }).click();
  await expect(notepad.getByText('Waiting for Google approval…', { exact: true })).toBeVisible();
  await notepad.getByRole('button', { name: 'Cancel connection', exact: true }).click();
  await expect(
    notepad.getByRole('button', { name: 'Connect Google Calendar', exact: true }),
  ).toBeEnabled();
  await expect(
    notepad.getByText('Google Calendar is not connected.', { exact: true }),
  ).toBeVisible();
});
