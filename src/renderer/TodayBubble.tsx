import { useEffect, useState } from 'react';
import { Check, ArrowUpRight, Plus } from 'lucide-react';
import { todayItems } from '../core/today';
import type { Snapshot, Reminder } from '../shared/contracts';
export function TodayBubble({
  data,
  open,
  complete,
  create,
}: {
  data: Snapshot | null;
  open: (kind: 'notes' | 'reminder', id: string) => void;
  complete: (id: string) => void;
  create: (kind: 'notes' | 'reminder') => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const items = data ? todayItems(data, now) : { overdue: [], upcoming: [], recentNotes: [] };
  const row = (r: Reminder, overdue = false) => (
    <div className={`today-reminder ${overdue ? 'is-overdue' : ''}`} key={r.id}>
      <button className="today-item" onClick={() => open('reminder', r.id)}>
        <span>{r.title}</span>
        <small>
          {overdue ? 'Overdue · ' : ''}
          {new Date(r.dueAt).toLocaleString(
            [],
            overdue
              ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
              : { hour: 'numeric', minute: '2-digit' },
          )}
        </small>
      </button>
      <button
        className="today-done"
        aria-label={`Complete ${r.title}`}
        onClick={() => complete(r.id)}
      >
        <Check size={13} />
      </button>
    </div>
  );
  return (
    <section
      className="today-panel"
      id="bubble-editor"
      role="tabpanel"
      aria-labelledby="bubble-tab-today"
    >
      <header>
        <h2>A little look ahead</h2>
        <span>
          {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </header>
      <div className="today-scroll">
        {!data ? (
          <p className="today-empty">Opening your day…</p>
        ) : (
          <>
            {!items.overdue.length && !items.upcoming.length && (
              <p className="today-empty">
                A little breathing room.<small>No reminders due today.</small>
              </p>
            )}
            {items.overdue.map((r) => row(r, true))}
            {items.upcoming.map((r) => row(r))}
            {!!items.recentNotes.length && (
              <>
                <h3>Recent notes</h3>
                {items.recentNotes.map((n) => (
                  <button className="today-note" key={n.id} onClick={() => open('notes', n.id)}>
                    <span>{n.title}</span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <footer>
        <button onClick={() => create('notes')}>
          <Plus size={12} /> New note
        </button>
        <button onClick={() => create('reminder')}>
          <Plus size={12} /> Reminder
        </button>
      </footer>
    </section>
  );
}
