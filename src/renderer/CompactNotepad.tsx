import { DateTimeField } from './DateTimeField';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Bell, CalendarDays, Settings, Plus, ArrowUpRight, Save } from 'lucide-react';
import type {
  CalendarStatus,
  Note,
  Reminder,
  Snapshot,
  NotebookItem,
  NotebookLaunch,
  LibraryItemRef,
} from '../shared/contracts';
import './compact.css';
import { ItemLibrary } from './ItemLibrary';

type Mode = 'notes' | 'reminders' | 'calendar';
type NoteFields = {
  id?: string;
  projectId: string;
  title: string;
  body: string;
  url?: string;
  publishedOn?: string;
};
type ReminderFields = {
  id?: string;
  projectId?: string;
  title: string;
  details: string;
  dateTime: string;
  durationMinutes: number;
  calendarSync: boolean;
  remindEnabled: boolean;
};
const blankNote = (): NoteFields => ({ projectId: '', title: '', body: '' });
function localDate(value = new Date(Date.now() + 3600000).toISOString()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const blankReminder = (): ReminderFields => ({
  title: '',
  details: '',
  dateTime: localDate(),
  durationMinutes: 30,
  calendarSync: false,
  remindEnabled: true,
});
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
const tabs = [
  { mode: 'notes', label: 'Notes', icon: BookOpen },
  { mode: 'reminders', label: 'Reminders', icon: Bell },
  { mode: 'calendar', label: 'Calendar', icon: CalendarDays },
] as const;

export function CompactNotepad({ initialMode = 'notes' }: { initialMode?: Mode }) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const focusEditor = useRef(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [data, setData] = useState<Snapshot | null>(null);
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null);
  const [note, setNote] = useState<NoteFields>(blankNote);
  const [reminder, setReminder] = useState<ReminderFields>(blankReminder);
  const [busy, setBusy] = useState('');
  const [cancellingConnection, setCancellingConnection] = useState(false);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  // Keep each note's typed contents when another note or mode is selected.
  const noteDrafts = useRef(new Map<string, NoteFields>());
  const reminderDrafts = useRef(new Map<string, ReminderFields>());
  const busyRef = useRef(false);
  const dirtyNotes = useRef(new Set<string>()),
    dirtyReminders = useRef(new Set<string>());
  const noteRef = useRef(note),
    reminderRef = useRef(reminder);
  noteRef.current = note;
  reminderRef.current = reminder;
  function editNote(next: NoteFields) {
    dirtyNotes.current.add(next.id ?? '');
    setNote(next);
  }
  function editReminder(next: ReminderFields) {
    dirtyReminders.current.add(next.id ?? '');
    setReminder(next);
  }
  const refresh = useCallback(async () => {
    if (!window.buddy) throw new Error('Open Pip’s notebook from the desktop app.');
    const snapshot = await window.buddy.call<Snapshot>('snapshot');
    setData(snapshot);
    if (snapshot.calendar) setCalendar(snapshot.calendar);
  }, []);
  useEffect(() => {
    void refresh().catch((error) => setMessage({ text: errorMessage(error), error: true }));
    return window.buddy?.onChange(() => {
      void refresh().catch((error) => setMessage({ text: errorMessage(error), error: true }));
    });
  }, [refresh]);
  useEffect(
    () =>
      window.buddy?.onNavigate((action) => {
        if (action === 'library') {
          setLibraryOpen(true);
          return;
        }
        setLibraryOpen(false);
        if (action === 'settings') {
          void window
            .buddy!.call('showFoxSettings')
            .catch((error) => setMessage({ text: errorMessage(error), error: true }));
        } else
          setMode(
            action === 'calendar' ? 'calendar' : action === 'reminder' ? 'reminders' : 'notes',
          );
      }),
    [],
  );
  useEffect(() => {
    if (mode !== 'calendar') return;
    void window.buddy
      ?.call<CalendarStatus>('calendarStatus')
      .then(setCalendar)
      .catch((error) => setMessage({ text: errorMessage(error), error: true }));
  }, [mode]);

  useEffect(() => {
    const openItem = (item: NotebookItem) => {
      setLibraryOpen(false);
      if (item.kind === 'note') {
        const draft =
          noteRef.current.id === item.note.id
            ? noteRef.current
            : noteDrafts.current.get(item.note.id);
        if (dirtyNotes.current.has(item.note.id) && draft) {
          setNote(draft);
          setMode('notes');
          setMessage({ text: 'Unsaved draft kept.' });
          return;
        }
        setNote((old) => {
          noteDrafts.current.set(old.id ?? '', old);
          return { ...item.note };
        });
        setMode('notes');
      } else {
        const r = item.reminder;
        const draft =
          reminderRef.current.id === r.id ? reminderRef.current : reminderDrafts.current.get(r.id);
        if (dirtyReminders.current.has(r.id) && draft) {
          setReminder(draft);
          setMode(item.kind === 'calendar' ? 'calendar' : 'reminders');
          setMessage({ text: 'Unsaved draft kept.' });
          return;
        }
        setReminder((old) => {
          reminderDrafts.current.set(old.id ?? '', old);
          return {
            id: r.id,
            projectId: r.projectId,
            title: r.title,
            details: r.details,
            dateTime: localDate(r.dueAt),
            durationMinutes: r.durationMinutes,
            calendarSync: !!r.calendarSync,
            remindEnabled: r.remindEnabled !== false,
          };
        });
        setMode(item.kind === 'calendar' ? 'calendar' : 'reminders');
      }
    };
    const unsub = window.buddy?.onOpenItem(openItem);
    void window.buddy
      ?.call<NotebookLaunch>('getNotebookLaunch')
      .then((launch) => {
        if (launch.action === 'library') {
          setLibraryOpen(true);
          return;
        }
        if (launch.item) openItem(launch.item);
        else
          setMode(
            launch.action === 'calendar'
              ? 'calendar'
              : launch.action === 'reminder'
                ? 'reminders'
                : 'notes',
          );
      })
      .catch((error) => setMessage({ text: errorMessage(error), error: true }));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = window.buddy?.onReminder((text) => {
      if (timer) clearTimeout(timer);
      setReminderNotice(text);
      timer = setTimeout(
        () => setReminderNotice((current) => (current === text ? null : current)),
        12000,
      );
    });
    return () => {
      unsub?.();
      if (timer) clearTimeout(timer);
    };
  }, []);
  async function run<T>(
    action: string,
    payload?: unknown,
    success?: string,
  ): Promise<T | undefined> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setMessage(null);
    try {
      const result = await window.buddy!.call<T>(action, payload);
      await refresh();
      if (action.startsWith('calendar'))
        setCalendar(await window.buddy!.call<CalendarStatus>('calendarStatus'));
      if (success) setMessage({ text: success });
      return result;
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }
  async function cancelConnection() {
    setCancellingConnection(true);
    try {
      // Authorization is still pending in run(); cancellation must bypass its busy lock.
      await window.buddy!.call('calendarCancelConnect');
    } catch (error) {
      setMessage({ text: errorMessage(error), error: true });
    } finally {
      setCancellingConnection(false);
    }
  }
  function selectNote(id: string) {
    noteDrafts.current.set(note.id ?? '', note);
    const saved = data?.notes.find((item) => item.id === id);
    setNote(
      (dirtyNotes.current.has(id) ? noteDrafts.current.get(id) : undefined) ??
        (saved ? { ...saved } : blankNote()),
    );
  }
  function selectReminder(id: string) {
    reminderDrafts.current.set(reminder.id ?? '', reminder);
    const saved = data?.reminders.find((item) => item.id === id);
    setReminder(
      (dirtyReminders.current.has(id) ? reminderDrafts.current.get(id) : undefined) ??
        (saved
          ? {
              id: saved.id,
              projectId: saved.projectId,
              title: saved.title,
              details: saved.details,
              dateTime: localDate(saved.dueAt),
              durationMinutes: saved.durationMinutes,
              calendarSync: !!saved.calendarSync,
              remindEnabled: saved.remindEnabled !== false,
            }
          : blankReminder()),
    );
  }
  function openSaved(ref: LibraryItemRef) {
    if (ref.kind === 'note') {
      selectNote(ref.id);
      setMode('notes');
    } else {
      selectReminder(ref.id);
      setMode('reminders');
    }
    focusEditor.current = true;
    setLibraryOpen(false);
  }
  function deletedSaved(refs: LibraryItemRef[]) {
    for (const ref of refs) {
      if (ref.kind === 'note') {
        noteDrafts.current.delete(ref.id);
        dirtyNotes.current.delete(ref.id);
        if (noteRef.current.id === ref.id) setNote(blankNote());
      } else {
        reminderDrafts.current.delete(ref.id);
        dirtyReminders.current.delete(ref.id);
        if (reminderRef.current.id === ref.id) setReminder(blankReminder());
      }
    }
  }
  useEffect(() => {
    if (!libraryOpen && focusEditor.current) {
      focusEditor.current = false;
      document
        .getElementById(mode === 'notes' ? 'compact-note-title' : 'compact-reminder-title')
        ?.focus();
    }
  }, [libraryOpen, mode]);
  async function saveNote(event: FormEvent) {
    event.preventDefault();
    const saved = await run<Note>(
      'saveNote',
      { ...note, projectId: note.projectId || data?.projects[0]?.id },
      'Note saved.',
    );
    if (saved) {
      dirtyNotes.current.delete(note.id ?? '');
      dirtyNotes.current.delete(saved.id);
      setNote({ ...saved });
      noteDrafts.current.set(saved.id, { ...saved });
      if (!note.id) noteDrafts.current.delete('');
    }
  }
  async function saveReminder(event: FormEvent) {
    event.preventDefault();
    const { dateTime, ...fields } = reminder;
    const saved = await run<Reminder>(
      'saveReminder',
      {
        ...fields,
        projectId: reminder.projectId || data?.projects[0]?.id,
        dueAt: new Date(dateTime).toISOString(),
      },
      'Reminder saved.',
    );
    if (saved) {
      const next: ReminderFields = {
        id: saved.id,
        projectId: saved.projectId,
        title: saved.title,
        details: saved.details,
        dateTime: localDate(saved.dueAt),
        durationMinutes: saved.durationMinutes,
        calendarSync: !!saved.calendarSync,
        remindEnabled: saved.remindEnabled !== false,
      };
      dirtyReminders.current.delete(reminder.id ?? '');
      dirtyReminders.current.delete(saved.id);
      setReminder(next);
      reminderDrafts.current.set(saved.id, next);
      if (!reminder.id) reminderDrafts.current.delete('');
    }
  }
  const savedReminder = data?.reminders.find((item) => item.id === reminder.id);
  const reminderChanged =
    !savedReminder ||
    savedReminder.title !== reminder.title ||
    savedReminder.details !== reminder.details ||
    localDate(savedReminder.dueAt) !== reminder.dateTime ||
    savedReminder.durationMinutes !== reminder.durationMinutes ||
    !!savedReminder.calendarSync !== reminder.calendarSync ||
    (savedReminder.remindEnabled !== false) !== reminder.remindEnabled;

  return (
    <main className={`compact-shell ${libraryOpen ? 'compact-library-shell' : ''}`}>
      <header className="compact-header">
        <div>
          <span className="compact-eyebrow">A LITTLE SPACE WITH PIP</span>
          <h1>My notebook</h1>
        </div>
        <div className="compact-header-actions">
          <button
            className="compact-secondary"
            type="button"
            aria-label="Saved items"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen(true)}
            disabled={!!busy}
          >
            <BookOpen size={16} />
            Saved
          </button>
          <button
            className="compact-icon-button"
            aria-label="Settings"
            title="Fox settings"
            onClick={() => void run('showFoxSettings')}
            disabled={!!busy}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
      {!libraryOpen && (
        <nav className="compact-tabs" role="tablist" aria-label="Notebook modes">
          {tabs.map(({ mode: id, label, icon: Icon }) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-controls={`panel-${id}`}
              aria-selected={mode === id}
              tabIndex={mode === id ? 0 : -1}
              onClick={() => setMode(id)}
              onKeyDown={(event) => {
                const index = tabs.findIndex((tab) => tab.mode === id);
                const next =
                  event.key === 'ArrowRight'
                    ? (index + 1) % tabs.length
                    : event.key === 'ArrowLeft'
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? tabs.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  setMode(tabs[next].mode);
                  document.getElementById(`tab-${tabs[next].mode}`)?.focus();
                }
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      )}
      {(message || reminderNotice) && (
        <p
          className={`compact-message ${message?.error ? 'is-error' : ''}`}
          role={message?.error || reminderNotice ? 'alert' : 'status'}
        >
          {message?.error ? message.text : (reminderNotice ?? message?.text)}
        </p>
      )}
      {!data ? (
        <div className="compact-loading">
          <p>Opening your notebook…</p>
          <button
            onClick={() =>
              void refresh().catch((error) =>
                setMessage({ text: errorMessage(error), error: true }),
              )
            }
          >
            Try again
          </button>
        </div>
      ) : libraryOpen ? (
        <ItemLibrary
          data={data}
          onRefresh={refresh}
          onOpen={openSaved}
          onDeleted={deletedSaved}
          onBack={() => setLibraryOpen(false)}
        />
      ) : (
        <section
          className="compact-panel"
          id={`panel-${mode}`}
          role="tabpanel"
          aria-labelledby={`tab-${mode}`}
        >
          {mode === 'notes' ? (
            <form className="compact-note-form" onSubmit={(event) => void saveNote(event)}>
              <fieldset disabled={!!busy} className="compact-fields compact-note-fields">
                <div className="compact-picker-row">
                  <button
                    type="button"
                    className="compact-secondary compact-grow"
                    aria-label="Browse saved notes"
                    onClick={() => setLibraryOpen(true)}
                  >
                    <BookOpen size={15} />
                    Saved notes
                  </button>
                  <button
                    type="button"
                    className="compact-secondary"
                    onClick={() => selectNote('')}
                  >
                    <Plus size={15} />
                    New note
                  </button>
                </div>
                {data.projects.length > 1 && (
                  <label>
                    Workspace
                    <select
                      value={note.projectId || data.projects[0]?.id}
                      onChange={(event) => editNote({ ...note, projectId: event.target.value })}
                    >
                      {data.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Note title
                  <input
                    id="compact-note-title"
                    aria-label="Note title"
                    required
                    maxLength={200}
                    placeholder="A little thought…"
                    value={note.title}
                    onChange={(event) => editNote({ ...note, title: event.target.value })}
                  />
                </label>
                <label className="compact-note-body">
                  Note text
                  <textarea
                    aria-label="Note text"
                    required
                    placeholder="Write anything here."
                    value={note.body}
                    onChange={(event) => editNote({ ...note, body: event.target.value })}
                  />
                </label>
                <div className="compact-save-row">
                  <span>Saved on this computer</span>
                  <button className="compact-primary" type="submit">
                    <Save size={15} />
                    {busy === 'saveNote' ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <>
              {mode === 'calendar' && (
                <section className="compact-calendar" aria-label="Google Calendar connection">
                  <div className="compact-section-heading">
                    <h2>Google Calendar</h2>
                    <span
                      className={`compact-connection ${calendar?.connected ? 'connected' : ''}`}
                    >
                      {calendar?.connected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <p>
                    {calendar?.connected
                      ? 'Reminders you choose can sync to your primary calendar.'
                      : 'Google Calendar is not connected.'}
                  </p>
                  {calendar && !calendar.configured && (
                    <>
                      <p>
                        Import a Google OAuth desktop-app credentials JSON file to enable sign-in.
                        Google approval opens in your system browser.
                      </p>
                      <button
                        className="compact-secondary"
                        disabled={!!busy}
                        onClick={() => void run('calendarConfigure')}
                      >
                        Import Google credentials
                      </button>
                      <details className="compact-setup-help">
                        <summary>How to get Google credentials</summary>
                        <ol>
                          <li>
                            In Google Cloud Console, select a project and enable the Google Calendar
                            API.
                          </li>
                          <li>
                            Configure Google Auth Platform branding and audience. If the app is in
                            testing, add your Google account as a test user.
                          </li>
                          <li>
                            Under Clients, create an OAuth client with application type Desktop app,
                            then download its JSON file.
                          </li>
                          <li>
                            Import that file here, then connect and approve access in your browser.
                          </li>
                        </ol>
                        <p>
                          This app does not include a registered Google client. Notes and local
                          reminders work without one.
                        </p>
                      </details>
                    </>
                  )}
                  <div className="compact-calendar-actions">
                    {calendar?.connected ? (
                      <>
                        <button
                          className="compact-secondary"
                          disabled={!!busy}
                          onClick={() =>
                            void run('calendarSync', undefined, 'Calendar sync finished.')
                          }
                        >
                          {busy === 'calendarSync' ? 'Syncing…' : 'Sync now'}
                        </button>
                        <button
                          className="compact-text-button"
                          disabled={!!busy}
                          onClick={() => void run('calendarDisconnect')}
                        >
                          Disconnect Google Calendar
                        </button>
                      </>
                    ) : (
                      <button
                        className="compact-secondary"
                        disabled={!!busy || !calendar?.configured}
                        onClick={() => void run('calendarConnect')}
                      >
                        {busy === 'calendarConnect'
                          ? 'Waiting for Google approval…'
                          : 'Connect Google Calendar'}
                      </button>
                    )}
                  </div>
                  {busy === 'calendarConnect' && (
                    <>
                      <p>
                        Finish approving access in your system browser. This window will update when
                        Google confirms.
                      </p>
                      <button
                        className="compact-text-button"
                        disabled={cancellingConnection}
                        onClick={() => void cancelConnection()}
                      >
                        {cancellingConnection ? 'Cancelling…' : 'Cancel connection'}
                      </button>
                    </>
                  )}
                  {calendar?.connected && (
                    <p className="compact-hint">
                      {calendar.pending} pending ·{' '}
                      {calendar.autoSync ? 'Automatic sync on' : 'Use Sync now to send changes'}
                      {calendar.lastSyncAt
                        ? ` · Last sync ${new Date(calendar.lastSyncAt).toLocaleString()}`
                        : ''}
                    </p>
                  )}
                  {calendar?.error && (
                    <p className="compact-inline-error" role="alert">
                      {calendar.error}
                    </p>
                  )}
                  <p className="compact-hint">
                    You can also open a Google event draft below. You must save that draft in Google
                    yourself.
                  </p>
                </section>
              )}
              <form
                className="compact-reminder-form"
                onSubmit={(event) => void saveReminder(event)}
              >
                <fieldset disabled={!!busy} className="compact-fields">
                  <div className="compact-picker-row">
                    <button
                      type="button"
                      className="compact-secondary compact-grow"
                      aria-label="Browse saved reminders"
                      onClick={() => setLibraryOpen(true)}
                    >
                      <BookOpen size={15} />
                      Saved reminders
                    </button>
                    <button
                      type="button"
                      className="compact-secondary"
                      onClick={() => selectReminder('')}
                    >
                      <Plus size={15} />
                      New reminder
                    </button>
                  </div>
                  <label>
                    Reminder title
                    <input
                      id="compact-reminder-title"
                      aria-label="Reminder title"
                      required
                      maxLength={200}
                      placeholder="What would you like to remember?"
                      value={reminder.title}
                      onChange={(event) => editReminder({ ...reminder, title: event.target.value })}
                    />
                  </label>
                  <label>
                    Details
                    <textarea
                      aria-label="Details"
                      rows={3}
                      value={reminder.details}
                      onChange={(event) =>
                        editReminder({ ...reminder, details: event.target.value })
                      }
                    />
                  </label>
                  <div className="compact-date-row">
                    <label className="compact-grow">
                      Date and time
                      <DateTimeField
                        value={reminder.dateTime}
                        disabled={!!busy}
                        required
                        onChange={(dateTime) => editReminder({ ...reminder, dateTime })}
                      />
                    </label>
                    <label>
                      Minutes
                      <input
                        aria-label="Duration in minutes"
                        type="number"
                        required
                        min={5}
                        max={1440}
                        value={reminder.durationMinutes}
                        onChange={(event) =>
                          editReminder({ ...reminder, durationMinutes: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <label className="compact-checkbox">
                    <input
                      type="checkbox"
                      checked={reminder.remindEnabled}
                      onChange={(event) =>
                        editReminder({ ...reminder, remindEnabled: event.target.checked })
                      }
                    />
                    Remind me
                  </label>
                  <label className="compact-checkbox">
                    <input
                      type="checkbox"
                      checked={reminder.calendarSync}
                      onChange={(event) =>
                        editReminder({ ...reminder, calendarSync: event.target.checked })
                      }
                    />
                    Sync this reminder to Google Calendar
                  </label>
                  {reminder.calendarSync && !calendar?.connected && (
                    <p className="compact-hint">
                      Saved locally. Connect Google Calendar to sync this reminder.
                    </p>
                  )}
                  {savedReminder?.completed && (
                    <p className="compact-hint">This reminder is marked complete.</p>
                  )}
                  <div className="compact-save-row">
                    <span>
                      {mode === 'calendar'
                        ? 'Calendar events are reminders, too.'
                        : 'Pip will give you a nudge.'}
                    </span>
                    <button type="submit" className="compact-primary">
                      <Save size={15} />
                      {busy === 'saveReminder' ? 'Saving…' : 'Save reminder'}
                    </button>
                  </div>
                </fieldset>
              </form>
              {mode === 'calendar' && (
                <div className="compact-manual-draft">
                  <button
                    className="compact-text-button"
                    disabled={!!busy || reminderChanged}
                    onClick={() =>
                      void run(
                        'googleCalendar',
                        { id: reminder.id },
                        'Google event draft opened. Save it in Google to add the event.',
                      )
                    }
                  >
                    <ArrowUpRight size={15} />
                    Open Google event draft
                  </button>
                  {reminderChanged && (
                    <p className="compact-hint">
                      Save your reminder first to open its event draft.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
      <footer className="compact-footer">
        <button
          className="compact-text-button"
          disabled={!!busy}
          onClick={() => void run('showWorkspace')}
        >
          All research tools <ArrowUpRight size={13} />
        </button>
      </footer>
    </main>
  );
}
export default CompactNotepad;
