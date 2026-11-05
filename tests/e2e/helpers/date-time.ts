import { expect, type Page } from '@playwright/test';
export async function chooseDateTime(page: Page, local: string) {
  await page.getByRole('button', { name: 'Date and time', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Date and time', exact: true });
  await dialog.getByLabel('Date', { exact: true }).fill(local.slice(0, 10));
  await dialog.getByLabel('Time', { exact: true }).fill(local.slice(11, 16));
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
