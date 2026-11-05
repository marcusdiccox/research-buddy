import { closeTestApp } from './helpers/close-app';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseDateTime } from './helpers/date-time';
let app: ElectronApplication, root: Page, bubble: Page, dir: string;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-dates-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  root = await app.firstWindow();
  await root.evaluate(() => window.buddy!.call('showBubble', { action: 'reminder' }));
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
test('the calendar fits the bubble and saves the selected local date and time', async () => {
  await bubble.getByRole('button', { name: 'Date and time', exact: true }).click();
  const picker = bubble.getByRole('dialog', { name: 'Date and time', exact: true });
  await expect(picker).toBeVisible();
  expect(
    await picker.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    }),
  ).toBe(true);
  const a11y = await new AxeBuilder({ page: bubble })
    .setLegacyMode()
    .include('dialog')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
  await bubble.screenshot({ path: 'test-results/date-time-picker.png' });
  await picker.getByLabel('Date', { exact: true }).fill('2030-11-09');
  await picker.getByLabel('Time', { exact: true }).fill('15:30');
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await bubble.getByRole('textbox', { name: 'Note text', exact: true }).fill('Future appointment');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  const expected = await bubble.evaluate(() => new Date('2030-11-09T15:30').toISOString());
  expect(
    (await bubble.evaluate(() => window.buddy!.call<any>('snapshot'))).reminders[0].dueAt,
  ).toBe(expected);
});
test('Cancel preserves the date and arrow keys can choose the next day', async () => {
  await chooseDateTime(bubble, '2030-11-09T15:30');
  const trigger = bubble.getByRole('button', { name: 'Date and time', exact: true });
  const before = await trigger.innerText();
  await trigger.click();
  let picker = bubble.getByRole('dialog', { name: 'Date and time', exact: true });
  await picker.getByLabel('Date', { exact: true }).fill('2030-11-10');
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(trigger).toHaveText(before, { useInnerText: true });
  await expect(trigger).toBeFocused();
  await trigger.click();
  picker = bubble.getByRole('dialog', { name: 'Date and time', exact: true });
  const day = picker.getByRole('button', { name: 'Saturday, November 9, 2030', exact: true });
  await day.focus();
  await day.press('ArrowRight');
  await expect(
    picker.getByRole('button', { name: 'Sunday, November 10, 2030', exact: true }),
  ).toBeFocused();
  await bubble.keyboard.press('Enter');
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  await bubble
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Keyboard appointment');
  await bubble.getByRole('button', { name: 'Save', exact: true }).click();
  const expected = await bubble.evaluate(() => new Date('2030-11-10T15:30').toISOString());
  expect(
    (await bubble.evaluate(() => window.buddy!.call<any>('snapshot'))).reminders[0].dueAt,
  ).toBe(expected);
});
