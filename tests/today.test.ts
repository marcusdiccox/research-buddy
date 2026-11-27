import { it, expect } from 'vitest';
import { localDayKey, todayItems, ordinaryBubbleMode } from '../src/core/today';
import { BuddyStore } from '../src/core/store';
it('uses local calendar boundaries, overdue items and existing library visibility', () => {
  const db = new BuddyStore(':memory:');
  const p = db.createProject({ name: 'Test' });
  const now = new Date(2026, 10, 26, 12);
  const due = (day: number, h = 15) => new Date(2026, 10, day, h).toISOString();
  const r = (title: string, day: number) =>
    db.saveReminder({
      projectId: p.id,
      title,
      dueAt: due(day),
      durationMinutes: 30,
      remindEnabled: false,
    });
  r('Today', 26);
  r('Overdue', 25);
  r('Future', 27);
  const done = r('Done', 26);
  db.completeReminder(done.id, true);
  const trash = r('Trash', 26);
  db.trashItems([{ kind: 'reminder', id: trash.id }]);
  const result = todayItems(db.snapshot(), now);
  expect(result.overdue.map((r) => r.title)).toEqual(['Overdue']);
  expect(result.upcoming.map((r) => r.title)).toEqual(['Today']);
  expect(localDayKey(now)).toBe('2026-11-26');
  expect(localDayKey(new Date(2026, 10, 27, 0, 0))).toBe('2026-11-27');
  db.close();
});
it('shows Today only on the first ordinary opening of the local day', () => {
  const now = new Date(2026, 10, 26, 0, 1);
  expect(ordinaryBubbleMode(undefined, now)).toBe('today');
  expect(ordinaryBubbleMode('2026-11-26', now)).toBe('notes');
  expect(ordinaryBubbleMode('2026-11-25', now)).toBe('today');
});
it('returns only the three most recently edited visible notes', () => {
  const db = new BuddyStore(':memory:');
  const p = db.createProject({ name: 'Test' });
  for (let i = 0; i < 5; i++) db.saveNote({ projectId: p.id, title: `Note ${i}`, body: 'Body' });
  const snapshot = db.snapshot();
  snapshot.notes.forEach((n, i) => (n.updatedAt = new Date(2026, 10, 26, i).toISOString()));
  const result = todayItems(snapshot, new Date(2026, 10, 26, 12));
  expect(result.recentNotes.map((n) => n.id)).toEqual(
    [...snapshot.notes]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3)
      .map((n) => n.id),
  );
  db.close();
});
