import { closeTestApp } from './helpers/close-app';
import AxeBuilder from '@axe-core/playwright';
import { chooseDateTime } from './helpers/date-time';
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
let app: ElectronApplication, root: Page, pad: Page, dir: string;
test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pip-library-ui-'));
  app = await electron.launch({
    executablePath: process.env.BUDDY_EXECUTABLE,
    args: process.env.BUDDY_EXECUTABLE ? [] : ['.'],
    env: { ...process.env, RESEARCH_BUDDY_DATA_DIR: dir, BUDDY_TEST: '1' },
  });
  root = await app.firstWindow();
  await root.evaluate(async () => {
    const snap = await window.buddy!.call<any>('snapshot'),
      projectId = snap.projects[0].id;
    await window.buddy!.call('saveNote', {
      projectId,
      title: 'Algebra',
      body: 'Polynomials and learning notes.',
    });
    await window.buddy!.call('saveNote', {
      projectId,
      title: 'Paper ideas',
      body: 'Fictional ideas about foxes.',
    });
    await window.buddy!.call('saveReminder', {
      title: 'Dentist',
      details: 'Routine appointment.',
      dueAt: '2030-11-09T15:00:00Z',
      durationMinutes: 30,
      remindEnabled: false,
    });
    await window.buddy!.call('showNotepad', { action: 'library' });
  });
  await expect
    .poll(() =>
      app
        .windows()
        .find((p) => p.url().endsWith('#notepad'))
        ?.url(),
    )
    .toBeTruthy();
  pad = app.windows().find((p) => p.url().endsWith('#notepad'))!;
});
test.afterEach(async () => {
  await closeTestApp(app);
  rmSync(dir, { recursive: true, force: true });
});
test('saved items are searchable, grouped across kinds, deleted and restored', async () => {
  await expect(pad.getByRole('heading', { name: 'Saved items', exact: true })).toBeVisible();
  const search = pad.getByRole('searchbox', { name: 'Search saved items' });
  await search.fill('Polynomials');
  await expect(pad.getByRole('button', { name: 'Open note Algebra', exact: true })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'Open reminder Dentist', exact: true })).toHaveCount(
    0,
  );
  await search.clear();
  await pad.getByRole('checkbox', { name: 'Select Algebra', exact: true }).check();
  await pad.getByRole('checkbox', { name: 'Select Dentist', exact: true }).check();
  await expect(pad.getByRole('checkbox', { name: 'Select Algebra', exact: true })).toBeChecked();
  await expect(pad.getByRole('checkbox', { name: 'Select Dentist', exact: true })).toBeChecked();
  await pad.getByRole('button', { name: 'New group', exact: true }).click();
  await pad.getByRole('textbox', { name: 'Group name', exact: true }).fill('School');
  await expect(pad.getByRole('dialog').getByRole('checkbox')).toBeChecked();
  await pad.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect
    .poll(async () => {
      const s = await pad.evaluate(() => window.buddy!.call<any>('snapshot'));
      return s.library.items.filter((item: any) => item.groupId === s.library.groups[0]?.id).length;
    })
    .toBe(2);
  await pad
    .getByRole('combobox', { name: 'Library group', exact: true })
    .selectOption({ label: 'School' });
  await expect(pad.getByRole('button', { name: 'Open note Paper ideas', exact: true })).toHaveCount(
    0,
  );
  await expect(
    pad.getByRole('button', { name: 'Open reminder Dentist', exact: true }),
  ).toBeVisible();
  await pad.getByRole('combobox', { name: 'Library group', exact: true }).selectOption('all');
  await pad.getByRole('button', { name: 'Delete Paper ideas', exact: true }).click();
  await pad.getByRole('button', { name: 'Move to Trash', exact: true }).click();
  await expect(pad.getByRole('button', { name: 'Open note Paper ideas', exact: true })).toHaveCount(
    0,
  );
  await pad.getByRole('combobox', { name: 'Library group', exact: true }).selectOption('trash');
  await pad.getByRole('button', { name: 'Restore Paper ideas', exact: true }).click();
  await pad.getByRole('combobox', { name: 'Library group', exact: true }).selectOption('all');
  await expect(
    pad.getByRole('button', { name: 'Open note Paper ideas', exact: true }),
  ).toBeVisible();
  const a11y = await new AxeBuilder({ page: pad })
    .setLegacyMode()
    .include('.item-library')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
  expect(await pad.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await pad.screenshot({ path: 'test-results/saved-library.png' });
});
test('browsing earlier items retains separate unsaved drafts', async () => {
  await pad.getByRole('button', { name: 'Open note Algebra', exact: true }).click();
  await pad.getByRole('textbox', { name: 'Note text', exact: true }).fill('Unsaved algebra draft');
  await pad.getByRole('button', { name: 'Saved items', exact: true }).click();
  await pad.getByRole('button', { name: 'Open note Paper ideas', exact: true }).click();
  await expect(pad.getByRole('textbox', { name: 'Note text', exact: true })).toHaveValue(
    'Fictional ideas about foxes.',
  );
  await pad.getByRole('button', { name: 'Saved items', exact: true }).click();
  await pad.getByRole('button', { name: 'Open note Algebra', exact: true }).click();
  await expect(pad.getByRole('textbox', { name: 'Note text', exact: true })).toHaveValue(
    'Unsaved algebra draft',
  );
});

for (const kind of ['note', 'reminder'] as const) {
  test(`trashing an open bubble ${kind} clears its saved identity safely`, async () => {
    await root.evaluate(
      (action) => window.buddy!.call('showBubble', { action }),
      kind === 'note' ? 'notes' : 'reminder',
    );
    await expect
      .poll(() =>
        app
          .windows()
          .find((p) => p.url().endsWith('#bubble'))
          ?.url(),
      )
      .toBeTruthy();
    const bubble = app.windows().find((p) => p.url().endsWith('#bubble'))!;
    if (kind === 'reminder') await chooseDateTime(bubble, '2030-11-09T15:30');
    const title = `Disposable ${kind}`;
    await bubble.getByRole('textbox', { name: 'Note text', exact: true }).fill(title);
    // The library's first paint can finish after its native window is created.
    // Surface the bubble again before this journey tests cross-window identity.
    await root.evaluate(
      (action) => window.buddy!.call('showBubble', { action }),
      kind === 'note' ? 'notes' : 'reminder',
    );
    await bubble.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bubble.getByRole('status')).toContainText('Saved');
    if (kind === 'reminder')
      await bubble
        .getByRole('textbox', { name: 'Note text', exact: true })
        .fill('Retained unsaved reminder draft');
    await bubble.getByRole('button', { name: 'Saved items', exact: true }).click();
    await pad.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
    await pad.getByRole('button', { name: 'Move to Trash', exact: true }).click();
    await expect(pad.getByRole('button', { name: `Delete ${title}`, exact: true })).toHaveCount(0);
    await root.evaluate(
      (action) => window.buddy!.call('showBubble', { action }),
      kind === 'note' ? 'notes' : 'reminder',
    );
    await expect(bubble.getByRole('textbox', { name: 'Note text', exact: true })).toHaveValue(
      kind === 'note' ? '' : 'Retained unsaved reminder draft',
    );
    await bubble
      .getByRole('textbox', { name: 'Note text', exact: true })
      .fill(`Replacement ${kind}`);
    await bubble.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bubble.getByRole('status')).toContainText('Saved');
    const active = await root.evaluate(() => window.buddy!.call<any>('snapshot'));
    expect(
      (kind === 'note' ? active.notes : active.reminders).some(
        (item: any) => item.title === `Replacement ${kind}`,
      ),
    ).toBe(true);
  });
}

for (const kind of ['note', 'reminder'] as const) {
  test(`trashing a non-last saved bubble ${kind} also clears its identity`, async () => {
    await root.evaluate(() => window.buddy!.call('showBubble'));
    await expect
      .poll(() =>
        app
          .windows()
          .find((p) => p.url().endsWith('#bubble'))
          ?.url(),
      )
      .toBeTruthy();
    const bubble = app.windows().find((p) => p.url().endsWith('#bubble'))!;
    for (const saveKind of [kind, kind === 'note' ? 'reminder' : 'note'] as const) {
      await root.evaluate(
        (action) => window.buddy!.call('showBubble', { action }),
        saveKind === 'note' ? 'notes' : 'reminder',
      );
      if (saveKind === 'reminder') await chooseDateTime(bubble, '2030-11-09T15:30');
      await bubble
        .getByRole('textbox', { name: 'Note text', exact: true })
        .fill(`Pair ${saveKind}`);
      await bubble.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(bubble.getByRole('status')).toContainText('Saved');
    }
    await bubble.getByRole('button', { name: 'Saved items', exact: true }).click();
    await pad.getByRole('button', { name: `Delete Pair ${kind}`, exact: true }).click();
    await pad.getByRole('button', { name: 'Move to Trash', exact: true }).click();
    await expect(pad.getByRole('button', { name: `Delete Pair ${kind}`, exact: true })).toHaveCount(
      0,
    );
    await root.evaluate(
      (action) => window.buddy!.call('showBubble', { action }),
      kind === 'note' ? 'notes' : 'reminder',
    );
    await bubble
      .getByRole('textbox', { name: 'Note text', exact: true })
      .fill(`Replaced pair ${kind}`);
    await bubble.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(bubble.getByRole('status')).toContainText('Saved');
  });
}
