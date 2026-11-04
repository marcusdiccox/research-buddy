import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { ArrowUpRight, Bell, BookOpen, CalendarDays, Settings, X } from 'lucide-react';
import type { Note, Reminder, Snapshot } from '../shared/contracts';
import './floating.css';

type Mode = 'notes' | 'reminder' | 'calendar';
type BubbleLayout = { tailX: number; tailSide: 'top' | 'bottom'; action?: Mode };
const modes = [
  { id: 'notes', label: 'Notes', icon: BookOpen },
  { id: 'reminder', label: 'Reminder', icon: Bell },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
] as const;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not save. Try again.';
const draftTitle = (text: string) =>
  text
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()
    .slice(0, 80) || 'Untitled note';
function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const nextHour = () => localDate(new Date(Date.now() + 3600000));

export function QuickBubble() {
  const [mode, setMode] = useState<Mode>('notes');
  const [text, setText] = useState('');
  const [dateTime, setDateTime] = useState(nextHour);
  const [data, setData] = useState<Snapshot | null>(null);
  const [layout, setLayout] = useState<BubbleLayout>({ tailX: 180, tailSide: 'bottom' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const initialized = useRef(false);
  const noteId = useRef<string | undefined>(undefined);
  const reminderId = useRef<string | undefined>(undefined);
  // Reopening a clean draft follows edits made in the expanded notebook.
  const dirty = useRef(false);
  const savedItem = useRef<{ kind: 'note' | 'reminder'; id: string; fingerprint: string } | null>(
    null,
  );
  const showError = (error: unknown) => setMessage({ text: errorText(error), error: true });
  const refresh = useCallback(async () => {
    if (!window.buddy) throw new Error('Open this bubble from Pip.');
    const [snapshot, position] = await Promise.all([
      window.buddy.call<Snapshot>('snapshot'),
      window.buddy.call<BubbleLayout>('bubbleLayout'),
    ]);
    setData(snapshot);
    setLayout(position);
    if (!initialized.current) {
      initialized.current = true;
      setMode(position.action ?? 'notes');
    }
    const previous = savedItem.current;
    if (!previous || busyRef.current) return;
    const item =
      previous.kind === 'note'
        ? snapshot.notes.find((note) => note.id === previous.id)
        : snapshot.reminders.find((reminder) => reminder.id === previous.id);
    if (!item) return;
    const fingerprint = JSON.stringify(item);
    if (fingerprint === previous.fingerprint) return;
    if (dirty.current) {
      setMessage({ text: 'Changed in notebook · your draft is kept' });
      return;
    }
    setText('body' in item ? item.body : item.details);
    if ('dueAt' in item) setDateTime(localDate(new Date(item.dueAt)));
    savedItem.current = { ...previous, fingerprint };
  }, []);

  useEffect(() => {
    void refresh().catch(showError);
    textarea.current?.focus();
    return window.buddy?.onChange(() => void refresh().catch(showError));
  }, [refresh]);
  useEffect(
    () =>
      window.buddy?.onNavigate((action) => {
        if (action === 'settings') {
          void window.buddy!.call('showFoxSettings').catch(showError);
          return;
        }
        setMode(action === 'calendar' ? 'calendar' : action === 'reminder' ? 'reminder' : 'notes');
        setMessage(null);
        void refresh().catch(showError);
        requestAnimationFrame(() => textarea.current?.focus());
      }),
    [refresh],
  );

  async function saveDraft() {
    if (mode === 'notes') {
      const existing = data?.notes.find((note) => note.id === noteId.current);
      const saved = await window.buddy!.call<Note>('saveNote', {
        ...existing,
        id: noteId.current,
        projectId: existing?.projectId ?? data?.projects[0]?.id,
        title: existing?.title ?? draftTitle(text),
        body: text,
      });
      if (!saved?.id) throw new Error('The note was not saved. Try again.');
      noteId.current = saved.id;
      savedItem.current = { kind: 'note', id: saved.id, fingerprint: JSON.stringify(saved) };
      dirty.current = false;
      return { noteId: saved.id };
    }
    const date = new Date(dateTime || nextHour());
    if (Number.isNaN(date.getTime())) throw new Error('Choose a valid date and time.');
    const existing = data?.reminders.find((reminder) => reminder.id === reminderId.current);
    const saved = await window.buddy!.call<Reminder>('saveReminder', {
      ...existing,
      id: reminderId.current,
      projectId: existing?.projectId ?? data?.projects[0]?.id,
      title: existing?.title ?? draftTitle(text),
      details: text,
      dueAt: date.toISOString(),
      durationMinutes: existing?.durationMinutes ?? 30,
      calendarSync: mode === 'calendar',
    });
    if (!saved?.id) throw new Error('The reminder was not saved. Try again.');
    reminderId.current = saved.id;
    savedItem.current = { kind: 'reminder', id: saved.id, fingerprint: JSON.stringify(saved) };
    dirty.current = false;
    return { reminderId: saved.id };
  }
  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await saveDraft();
      setMessage({
        text:
          mode === 'calendar'
            ? data?.calendar?.connected
              ? 'Saved locally · queued for sync'
              : 'Saved locally · queued until connected'
            : 'Saved locally',
      });
    });
  }
  async function openNotebook(action: Mode = mode) {
    await run(async () => {
      const existing = mode === 'notes' ? noteId.current : reminderId.current;
      const sameKind =
        savedItem.current?.kind === (mode === 'notes' ? 'note' : 'reminder') &&
        savedItem.current.id === existing;
      const item = text.trim()
        ? !dirty.current && existing && sameKind
          ? mode === 'notes'
            ? { noteId: existing }
            : { reminderId: existing }
          : await saveDraft()
        : {};
      await window.buddy!.call('showNotepad', { action, ...item });
      await window.buddy!.call('hideBubble');
    });
  }
  function changeMode(next: Mode) {
    if (next !== mode) dirty.current = true;
    setMode(next);
    setMessage(null);
  }

  return (
    <main
      className={`quick-bubble tail-${layout.tailSide}`}
      style={{ '--tail-x': `${layout.tailX}px` } as CSSProperties}
    >
      <section className="floating-card bubble-card" aria-label="Quick note">
        <header className="floating-header">
          <span className="bubble-caption">Pip</span>
          <div className="floating-header-actions">
            <button
              type="button"
              className="floating-icon"
              aria-label="Settings"
              title="Settings"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await window.buddy!.call('showFoxSettings');
                })
              }
            >
              <Settings size={15} />
            </button>
            <button
              type="button"
              className="floating-icon"
              aria-label="Close"
              title="Close"
              onClick={() => void window.buddy?.call('hideBubble').catch(showError)}
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <nav className="bubble-tabs" role="tablist" aria-label="Bubble modes">
          {modes.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              id={`bubble-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={mode === id}
              aria-controls="bubble-editor"
              tabIndex={mode === id ? 0 : -1}
              disabled={busy}
              onClick={() => changeMode(id)}
              onKeyDown={(event) => {
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % modes.length
                    : event.key === 'ArrowLeft'
                      ? (index + modes.length - 1) % modes.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? modes.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                changeMode(modes[next].id);
                document.getElementById(`bubble-tab-${modes[next].id}`)?.focus();
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>
        <form className="bubble-form" onSubmit={save}>
          <div
            id="bubble-editor"
            role="tabpanel"
            aria-labelledby={`bubble-tab-${mode}`}
            className="bubble-editor"
          >
            <textarea
              ref={textarea}
              aria-label="Note text"
              placeholder={
                mode === 'notes' ? 'Write a little note…' : 'What do you want to remember?'
              }
              value={text}
              disabled={busy}
              onChange={(event) => {
                dirty.current = true;
                setText(event.target.value);
                setMessage(null);
              }}
            />
            {mode !== 'notes' && (
              <label className="bubble-date">
                When
                <input
                  type="datetime-local"
                  aria-label="Date and time"
                  value={dateTime}
                  disabled={busy}
                  onChange={(event) => {
                    dirty.current = true;
                    setDateTime(event.target.value);
                    setMessage(null);
                  }}
                />
              </label>
            )}
            {mode === 'calendar' && (
              <div className="bubble-calendar-status">
                <span>
                  {data?.calendar?.connected
                    ? 'Google Calendar connected'
                    : 'Not connected · saves locally'}
                </span>
                {!data?.calendar?.connected && (
                  <button
                    type="button"
                    disabled={busy || !data}
                    onClick={() => void openNotebook('calendar')}
                  >
                    Connect in notebook
                  </button>
                )}
              </div>
            )}
          </div>
          <p
            className={`floating-status ${message?.error ? 'is-error' : ''}`}
            role={message?.error ? 'alert' : 'status'}
          >
            {message?.text ?? '\u00a0'}
          </p>
          <footer className="bubble-footer">
            <button
              className="bubble-expand"
              type="button"
              disabled={busy || !data}
              onClick={() => void openNotebook()}
            >
              Open notebook
              <ArrowUpRight size={13} />
            </button>
            <button className="bubble-save" type="submit" disabled={busy || !data || !text.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </section>
    </main>
  );
}
export default QuickBubble;
