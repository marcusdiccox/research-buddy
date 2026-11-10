import { closeTestApp } from './helpers/close-app';
import { chooseDateTime } from './helpers/date-time';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
let app: ElectronApplication;
let dir: string;
const launch = () =>
  electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'buddy-e2e-'));
  app = await launch();
});
test.afterEach(async () => {
  await closeTestApp(app);
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
test('advanced research settings still expose notifications and export', async () => {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Show desktop notifications')).toBeVisible();
  await page.getByLabel('Show desktop notifications').click();
  await expect(page.getByLabel('Show desktop notifications')).not.toBeChecked();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.buddy!.call<any>('snapshot'))).settings.notifications,
    )
    .toBe(false);
  await expect(page.getByRole('button', { name: 'Export this workspace' })).toBeVisible();
});

test('startup backs up the notebook and a same-day restart preserves the earlier snapshot', async () => {
  const waitUntilReady = () =>
    expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (window) =>
              window.webContents.getURL().endsWith('#pet') && !window.webContents.isLoading(),
          ),
        ),
      )
      .toBe(true);
  await waitUntilReady();
  const page = await app.firstWindow();
  const initial = await page.evaluate(() => window.buddy!.call<any>('snapshot'));
  const backupDir = join(dir, 'backups');
  const files = readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'));
  expect(files).toHaveLength(1);
  const snapshot = new DatabaseSync(join(backupDir, files[0]), { readOnly: true });
  try {
    const project = snapshot.prepare("SELECT id FROM records WHERE kind='project'").get();
    expect(project?.id).toBe(initial.projects[0].id);
  } finally {
    snapshot.close();
  }
  await page.evaluate(
    (projectId) =>
      window.buddy!.call('saveNote', {
        projectId,
        title: 'After startup',
        body: 'This stays in the active notebook.',
      }),
    initial.projects[0].id,
  );
  await closeTestApp(app);
  app = await launch();
  await waitUntilReady();
  const reopened = await app.firstWindow();
  const current = await reopened.evaluate(() => window.buddy!.call<any>('snapshot'));
  expect(current.notes[0].body).toBe('This stays in the active notebook.');
  expect(readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'))).toEqual(files);
  const original = new DatabaseSync(join(backupDir, files[0]), { readOnly: true });
  try {
    expect(original.prepare("SELECT count(*) AS n FROM records WHERE kind='note'").get()?.n).toBe(
      0,
    );
  } finally {
    original.close();
  }
});
test('a beginner can save a note, summarize it, inspect evidence and restart', async () => {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'A little clarity, every day.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a note', exact: true }).first().click();
  await page.getByLabel('Note title').fill('My first research note');
  await page
    .getByLabel('Your notes')
    .fill(
      'Aster revenue rose 12%. The biggest risk is a component shortage. Review demand next week.',
    );
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My first research note' })).toBeVisible();
  await page.getByRole('button', { name: 'Quick summary', exact: true }).click();
  await expect(page.getByText('Key passages, picked on your device')).toBeVisible();
  await page.getByRole('button', { name: 'See source', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Supporting passage' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  if (!process.env.BUDDY_EXECUTABLE)
    await page.screenshot({ path: 'test-results/research-buddy-notes.png', fullPage: true });
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.getByLabel('Your notes').fill('Aster revenue declined 8%. The outlook has changed.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('This note has changed since its last summary.')).toBeVisible();
  await expect(page.locator('.summary-panel .takeaway')).toHaveCount(0);
  await closeTestApp(app);
  app = await launch();
  const reopened = await app.firstWindow();
  await expect(reopened.getByText('My first research note').first()).toBeVisible();
});
test('reminders can be created, snoozed, completed and turned into calendar drafts', async () => {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: 'New reminder', exact: true }).click();
  await page.getByLabel('What would you like to remember?').fill('Review earnings');
  await chooseDateTime(page, '2027-01-10T10:30');
  await page.getByRole('button', { name: 'Save reminder', exact: true }).click();
  await expect(page.getByText('Review earnings')).toBeVisible();
  const stored = await page.evaluate(async () => {
    const s = await window.buddy!.call<any>('snapshot');
    const r = s.reminders[0];
    return { reminder: r, url: await window.buddy!.call<string>('calendarPreview', { id: r.id }) };
  });
  expect(new URL(stored.url).searchParams.get('text')).toBe('Review earnings');
  await page.getByRole('button', { name: 'Mark complete' }).click();
  await expect(page.getByText('All caught up!')).toBeVisible();
  await page.getByRole('button', { name: 'Show completed' }).click();
  await expect(page.getByText('Review earnings')).toBeVisible();
  await page.getByRole('button', { name: 'Reopen reminder' }).click();
  await page.getByRole('button', { name: 'Snooze 15 minutes' }).click();
  await expect(page.getByRole('status')).toContainText('15 minutes');
  if (!process.env.BUDDY_EXECUTABLE)
    await page.screenshot({ path: 'test-results/research-buddy-reminders.png', fullPage: true });
});
test('sample workspace, scoped questions and journal work without a key', async () => {
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Try a sample workspace', exact: true }).click();
  await expect(
    page.locator('.breadcrumb').getByText('Aster Devices', { exact: true }),
  ).toBeVisible();
  if (!process.env.BUDDY_EXECUTABLE)
    await page.screenshot({ path: 'test-results/research-buddy-home.png', fullPage: true });
  await page.getByRole('button', { name: 'Ask my notes', exact: true }).click();
  await page.getByLabel('Your question').fill('What is the demand risk?');
  await page.getByRole('button', { name: 'Find in my notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'See source', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Thesis journal', exact: true }).click();
  await page.getByRole('button', { name: 'New journal entry', exact: true }).click();
  await page.getByLabel('What do you think?').fill('Demand looks strong, but supply is uncertain.');
  await page.getByLabel(/What’s the other side/).fill('Suppliers may miss deliveries.');
  await page.getByLabel(/What would change your mind/).fill('Demand drops below the forecast.');
  await page.getByRole('button', { name: 'Save journal entry', exact: true }).click();
  await expect(page.locator('.journal-thesis')).toHaveText(
    'Demand looks strong, but supply is uncertain.',
  );
  await page.getByRole('button', { name: 'Revise', exact: true }).click();
  await page.getByLabel(/What’s the other side/).fill('New counterargument.');
  await page.getByLabel(/What would change your mind/).fill('New condition.');
  await page.getByRole('button', { name: 'Save journal entry', exact: true }).click();
  await page.getByText('Revision history (2)', { exact: true }).click();
  await expect(
    page.locator('.history-entry').filter({ hasText: 'Suppliers may miss deliveries.' }),
  ).toContainText('Demand drops below the forecast.');
});
test('main screens and the reminder form are readable and keyboard accessible', async () => {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: 'A little clarity, every day.' }).waitFor();
  // Electron cannot create an auxiliary browser tab. This app has no iframes.
  const home = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    home.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Reminders', exact: true }).click();
  await page.getByRole('button', { name: 'New reminder', exact: true }).click();
  await expect(page.getByLabel('What would you like to remember?')).toBeFocused();
  const reminder = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(
    reminder.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New reminder', exact: true })).toBeFocused();
});
