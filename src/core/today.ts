import type { Snapshot } from '../shared/contracts.js';
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function ordinaryBubbleMode(lastDay: string | undefined, now: Date): 'notes' | 'today' {
  return lastDay === localDayKey(now) ? 'notes' : 'today';
}
export function todayItems(snapshot: Pick<Snapshot, 'notes' | 'reminders'>, now: Date) {
  const active = snapshot.reminders
    .filter((r) => !r.completed)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
  return {
    overdue: active.filter((r) => Date.parse(r.dueAt) < now.getTime()),
    upcoming: active.filter(
      (r) =>
        Date.parse(r.dueAt) >= now.getTime() && localDayKey(new Date(r.dueAt)) === localDayKey(now),
    ),
    recentNotes: [...snapshot.notes]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, 3),
  };
}
