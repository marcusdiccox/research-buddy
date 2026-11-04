import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Sprout,
  BookOpen,
  MessageCircle,
  Bell,
  NotebookPen,
  Settings as SettingsIcon,
  Plus,
  Search,
  ArrowUpRight,
  FileText,
  Upload,
  Sparkles,
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Download,
  X,
  ChevronRight,
  ExternalLink,
  Leaf,
  ShieldCheck,
  Pencil,
  History,
} from 'lucide-react';
import type {
  Snapshot,
  Note,
  Project,
  ResearchResult,
  Reminder,
  JournalEntry,
  Citation,
  Settings,
} from '../shared/contracts';
import { Pip, Modal, Empty, SettingToggle } from './components';
import { FoxSettings } from './FoxSettings';

type View = 'notes' | 'ask' | 'reminders' | 'journal' | 'settings';
type Dialog =
  | { kind: 'note'; note?: Note; imported?: { title: string; body: string } }
  | { kind: 'reminder'; reminder?: Reminder }
  | { kind: 'project' }
  | { kind: 'journal'; entry?: JournalEntry; prefill?: string; evidence?: Citation[] }
  | { kind: 'source'; note: Note; quote: string }
  | null;
const navigation = [
  { id: 'notes', label: 'My notes', icon: BookOpen },
  { id: 'ask', label: 'Ask my notes', icon: MessageCircle },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'journal', label: 'Thesis journal', icon: NotebookPen },
] as const;
const prettyDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
const prettyTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
function localDate(value = new Date(Date.now() + 3600000).toISOString()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [projectId, setProjectId] = useState(''),
    [view, setView] = useState<View>('notes'),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [dialog, setDialog] = useState<Dialog>(null),
    [busy, setBusy] = useState(''),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null),
    [result, setResult] = useState<ResearchResult | null>(null),
    [completed, setCompleted] = useState(false),
    [question, setQuestion] = useState('');
  const refresh = useCallback(async () => {
    if (!window.buddy) throw new Error('Please open Research Buddy using its desktop shortcut.');
    const value = await window.buddy.call<Snapshot>('snapshot');
    setData(value);
    setProjectId((old) =>
      value.projects.some((p) => p.id === old) ? old : (value.projects[0]?.id ?? ''),
    );
  }, []);
  useEffect(() => {
    refresh().catch((e) => setToast({ text: e.message, error: true }));
    return window.buddy?.onChange(() => {
      refresh().catch((e) => setToast({ text: e.message, error: true }));
    });
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 12000 : 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(
    () =>
      window.buddy?.onNavigate((action) => {
        if (dialog) {
          if (action !== 'notes')
            setToast({ text: 'Finish or close your open form first. Pip will be right here.' });
          return;
        }
        setSelected(null);
        setQuery('');
        setResult(null);
        if (action === 'settings') setView('settings');
        else if (action === 'reminder') {
          setView('reminders');
          setDialog({ kind: 'reminder' });
        } else setView('notes');
      }),
    [dialog],
  );
  const closeDialog = useCallback(() => setDialog(null), []);
  async function run<T>(action: string, payload?: unknown, message?: string): Promise<T | null> {
    if (busy) return null;
    setBusy(action);
    try {
      const value = await window.buddy!.call<T>(action, payload);
      await refresh();
      if (message && value !== null) setToast({ text: message });
      return value;
    } catch (e) {
      setToast({
        text: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        error: true,
      });
      return null;
    } finally {
      setBusy('');
    }
  }
  const project = data?.projects.find((p) => p.id === projectId),
    notes = useMemo(
      () => data?.notes.filter((n) => n.projectId === projectId) ?? [],
      [data, projectId],
    ),
    filtered = notes.filter((n) =>
      (n.title + ' ' + n.body).toLowerCase().includes(query.toLowerCase()),
    ),
    note = notes.find((n) => n.id === selected),
    reminders = data?.reminders ?? [],
    pending = reminders.filter((r) => !r.completed),
    entries = data?.journal.filter((j) => j.projectId === projectId) ?? [];
  const latestEntries = entries.filter(
    (entry, index, all) => all.findIndex((j) => j.entryId === entry.entryId) === index,
  );
  const noteSummary =
    result?.kind === 'summary' && result.noteId === note?.id
      ? result
      : data?.results.find((r) => r.kind === 'summary' && r.noteId === note?.id);
  const answer =
    result?.kind === 'answer' && result.projectId === projectId
      ? result
      : data?.results.find((r) => r.kind === 'answer' && r.projectId === projectId);
  function switchView(next: View) {
    setView(next);
    setSelected(null);
    setQuery('');
    setResult(null);
  }
  async function importFile() {
    const imported = await run<{ title: string; body: string }>('importFile');
    if (imported) setDialog({ kind: 'note', imported });
  }
  async function citation(c: Citation) {
    const source = await run<Note>('revision', { projectId, id: c.revisionId });
    if (source) setDialog({ kind: 'source', note: source, quote: c.quote });
  }
  async function toggleSetting(key: keyof Settings, value: boolean) {
    await run('settings', { [key]: value });
  }
  function changeFoxSettings(patch: Partial<Settings>) {
    if (busy) return;
    setData((current) =>
      current ? { ...current, settings: { ...current.settings, ...patch } } : current,
    );
    void run('settings', patch).then((result) => {
      if (result === null) void refresh().catch(() => {});
    });
  }
  async function demo() {
    const p = await run<Project>(
      'seedDemo',
      undefined,
      'A fictional sample workspace is ready. Make yourself at home!',
    );
    if (p) {
      setProjectId(p.id);
      setView('notes');
      setSelected(null);
    }
  }
  if (!data)
    return (
      <div className="loading">
        <Pip />
        <h1>Getting your notebook ready…</h1>
        {toast && <p role="alert">{toast.text}</p>}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchView('notes');
          }}
          className="brand"
        >
          <span className="brand-icon">
            <Sprout size={25} />
          </span>
          <span>
            research
            <span className="brand-second">
              buddy<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <div className="workspace-label">
          YOUR SPACE{' '}
          <button
            className="icon-button"
            aria-label="New workspace"
            onClick={() => setDialog({ kind: 'project' })}
          >
            <Plus size={15} />
          </button>
        </div>
        <select
          aria-label="Workspace"
          className="workspace-select"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setSelected(null);
            setResult(null);
          }}
        >
          {data.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => switchView(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'reminders' && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={18} />
            <p>
              A little progress
              <br />
              <strong>is still progress.</strong>
            </p>
          </div>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => switchView('settings')}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </button>
          <div className="local-label">
            <span />
            Saved on your device
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Your space</span>
            <ChevronRight size={13} />
            <strong>{project?.name}</strong>
            {project?.ticker && <span className="ticker">{project.ticker}</span>}
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <button
              className="icon-button"
              aria-label="Show desktop companion"
              title="Show desktop companion"
              onClick={() => run('showPet', undefined, 'Pip is ready on your desktop.')}
            >
              <Sprout size={20} />
            </button>
          </div>
        </header>
        <div className="page-content">
          {view === 'notes' && !note && (
            <>
              <section className="welcome">
                <div>
                  <div className="eyebrow">
                    <span />A LITTLE SPACE FOR BIG IDEAS
                  </div>
                  <h1>
                    A little clarity,
                    <br />
                    <em>every day.</em>
                  </h1>
                  <p>
                    Gather your thoughts. Find what matters.
                    <br />
                    Your little research buddy is here to help.
                  </p>
                  <div className="hero-actions">
                    <button className="button primary" onClick={() => setDialog({ kind: 'note' })}>
                      <Plus size={17} />
                      Add a note
                    </button>
                    <button className="text-button" disabled={!!busy} onClick={demo}>
                      Try a sample workspace <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
                <div className="welcome-art">
                  <span className="spark star-one">✧</span>
                  <span className="spark star-two">✧</span>
                  <div className="art-orbit" />
                  <Pip happy appearance={data.settings.petAppearance} />
                  <div className="pip-caption">Hi, I’m Pip. Let’s make sense of it.</div>
                  <span className="art-flower">✳</span>
                </div>
              </section>
              <div className="section-toolbar">
                <div>
                  <h2>
                    Your notes <span className="count">{notes.length}</span>
                  </h2>
                  <p>A home for things you want to understand.</p>
                </div>
                <div className="toolbar-controls">
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search notes"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a note…"
                    />
                  </label>
                  <button className="button secondary" disabled={!!busy} onClick={importFile}>
                    <Upload size={16} />
                    Import a file
                  </button>
                </div>
              </div>
              {filtered.length ? (
                <div className="notes-grid">
                  {filtered.map((n, index) => (
                    <button
                      key={n.id}
                      className={`note-card tint-${index % 4}`}
                      onClick={() => {
                        setSelected(n.id);
                        setResult(null);
                      }}
                    >
                      <div className="note-card-top">
                        <span className="note-tag">
                          <FileText size={12} />
                          {n.url ? 'Source note' : 'Personal note'}
                        </span>
                        <ArrowUpRight size={17} />
                      </div>
                      <h3>{n.title}</h3>
                      <p>{n.body.slice(0, 190)}</p>
                      <div className="note-card-bottom">
                        <span>{prettyDate(n.updatedAt)}</span>
                        <span>
                          Open note <ChevronRight size={13} />
                        </span>
                      </div>
                    </button>
                  ))}
                  <button className="add-card" onClick={() => setDialog({ kind: 'note' })}>
                    <span>
                      <Plus size={24} />
                    </span>
                    <strong>A new thought?</strong>
                    <p>Give it a little home.</p>
                  </button>
                </div>
              ) : (
                <Empty
                  title={query ? 'No matching notes' : 'Your next good idea starts here'}
                  description={
                    query
                      ? 'Try a different word or clear the search.'
                      : 'Paste a thought, import a note, or try the sample workspace to see how it all works.'
                  }
                >
                  {!query && (
                    <button
                      className="button secondary"
                      onClick={() => setDialog({ kind: 'note' })}
                    >
                      <Plus size={16} />
                      Add a note
                    </button>
                  )}
                </Empty>
              )}
              <div className="gentle-footer">
                <ShieldCheck size={15} />
                <span>Your notes stay on this device. No account needed.</span>
              </div>
            </>
          )}
          {view === 'notes' && note && (
            <>
              <button className="text-button back-button" onClick={() => setSelected(null)}>
                <ArrowLeft size={16} />
                Back to notes
              </button>
              <div className="detail-heading">
                <div className="eyebrow">YOUR RESEARCH, ALL TOGETHER</div>
                <h1>{note.title}</h1>
                <p>
                  Saved {prettyDate(note.updatedAt)} ·{' '}
                  {note.publishedOn ? `Published ${note.publishedOn}` : 'Publication date unknown'}
                </p>
              </div>
              <div className="detail-actions">
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={async () => {
                    const r = await run<ResearchResult>('summary', { projectId, id: note.id });
                    if (r) setResult(r);
                  }}
                >
                  <Sparkles size={16} />
                  {busy === 'summary' ? 'Finding the key points…' : 'Quick summary'}
                </button>
                <button
                  className="button secondary"
                  onClick={() => setDialog({ kind: 'note', note })}
                >
                  <Pencil size={15} />
                  Edit note
                </button>
                <button
                  className="button secondary"
                  onClick={() => setDialog({ kind: 'reminder', reminder: undefined })}
                >
                  <Bell size={15} />
                  Set a reminder
                </button>
              </div>
              <div className="reading-layout">
                <article className="paper">
                  <div className="paper-heading">
                    <FileText size={17} />
                    <h2>Original note</h2>
                  </div>
                  {note.url && <p className="source-url">Source: {note.url}</p>}
                  <div className="note-body">{note.body}</div>
                </article>
                <aside className="summary-panel">
                  {noteSummary &&
                  noteSummary.points.every((p) => p.citation.revisionId === note.revisionId) ? (
                    <ResearchCard
                      result={noteSummary}
                      onCitation={citation}
                      onJournal={() =>
                        setDialog({
                          kind: 'journal',
                          prefill: noteSummary.points.map((p) => p.text).join('\n\n'),
                          evidence: noteSummary.points.map((p) => p.citation),
                        })
                      }
                    />
                  ) : (
                    <div className="summary-empty">
                      <Sparkles size={27} />
                      <h2>{noteSummary ? 'A fresh look is due.' : 'A fresh pair of eyes.'}</h2>
                      {noteSummary ? (
                        <>
                          <p>This note has changed since its last summary.</p>
                          <p>
                            Run Quick summary for the latest version. Earlier evidence stays safely
                            saved.
                          </p>
                        </>
                      ) : (
                        <p>
                          Quick summary picks the key passages from your note. Every point links
                          back to its source.
                        </p>
                      )}
                      <span className="small-pill">Works offline · no AI key needed</span>
                    </div>
                  )}
                </aside>
              </div>
            </>
          )}
          {view === 'ask' && (
            <>
              <PageHeading
                eyebrow="CONNECT THE DOTS"
                title="A question is a good start."
                description="Find the passages that matter, across this workspace’s notes."
              />
              <form
                className="ask-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await run<ResearchResult>('ask', { projectId, question });
                  if (r) setResult(r);
                }}
              >
                <label htmlFor="question">Your question</label>
                <div className="ask-input">
                  <MessageCircle size={21} />
                  <input
                    id="question"
                    value={question}
                    required
                    maxLength={2000}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What are the biggest risks in my research?"
                  />
                  <button className="button primary" disabled={!!busy || !question.trim()}>
                    {busy === 'ask' ? 'Looking through your notes…' : 'Find in my notes'}
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <p>
                  <ShieldCheck size={13} />
                  Searches only {project?.name}. No notes are sent to the internet.
                </p>
              </form>
              {answer ? (
                <div className="answer-card">
                  <ResearchCard
                    result={answer}
                    onCitation={citation}
                    onJournal={() =>
                      setDialog({
                        kind: 'journal',
                        prefill: answer.points.map((p) => p.text).join('\n\n'),
                        evidence: answer.points.map((p) => p.citation),
                      })
                    }
                  />
                </div>
              ) : (
                <Empty
                  title="Let’s find it together"
                  description="Ask about a topic in your notes. Pip finds matching passages, with links so you can check the full context."
                />
              )}
            </>
          )}
          {view === 'reminders' && (
            <>
              <div className="heading-with-action">
                <PageHeading
                  eyebrow="A GENTLE NUDGE"
                  title="A little less to remember."
                  description="Make room in your head. I’ll keep an eye on the little things."
                />
                <button className="button primary" onClick={() => setDialog({ kind: 'reminder' })}>
                  <Plus size={16} />
                  New reminder
                </button>
              </div>
              <div className="reminder-info">
                <CalendarDays size={21} />
                <div>
                  <strong>Make a little time for it.</strong>
                  <p>
                    Add any reminder to Google Calendar, or save a calendar file. You review and
                    save the event in your calendar.
                  </p>
                </div>
              </div>
              <div className="section-toolbar">
                <h2>
                  {completed ? 'Completed reminders' : 'Coming up'}{' '}
                  <span className="count">
                    {completed ? reminders.filter((r) => r.completed).length : pending.length}
                  </span>
                </h2>
                <button className="text-button" onClick={() => setCompleted(!completed)}>
                  {completed ? 'Show upcoming' : 'Show completed'}
                </button>
              </div>
              <div className="reminder-list">
                {reminders
                  .filter((r) => r.completed === completed)
                  .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
                  .map((r) => (
                    <div
                      className={`reminder-card ${Date.parse(r.dueAt) < Date.now() && !r.completed ? 'overdue' : ''}`}
                      key={r.id}
                    >
                      <button
                        className={`complete-circle ${r.completed ? 'is-complete' : ''}`}
                        aria-label={r.completed ? 'Reopen reminder' : 'Mark complete'}
                        disabled={!!busy}
                        onClick={async () => {
                          const updated = await run(
                            'completeReminder',
                            { id: r.id, completed: !r.completed },
                            r.completed
                              ? 'Reminder reopened.'
                              : 'One less thing on your mind. Nice work!',
                          );
                          if (updated && r.completed) setCompleted(false);
                        }}
                      >
                        <Check size={16} />
                      </button>
                      <div className="reminder-main">
                        <h3>{r.title}</h3>
                        <div className="reminder-meta">
                          <span>
                            <Clock size={13} />
                            {prettyTime(r.dueAt)}
                          </span>
                          <span>{r.durationMinutes} min</span>
                          {Date.parse(r.dueAt) < Date.now() && !r.completed && (
                            <span className="overdue-badge">Ready when you are</span>
                          )}
                        </div>
                        {r.details && <p>{r.details}</p>}
                        {r.notificationError && (
                          <p className="notification-error">
                            Windows couldn’t show this reminder. Check notification settings; Pip
                            will try again a little later.
                          </p>
                        )}
                        <div className="reminder-actions">
                          <button
                            className="text-button"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                'googleCalendar',
                                { id: r.id },
                                'Google Calendar opened. Review the details and click Save there.',
                              )
                            }
                          >
                            <CalendarDays size={14} />
                            Add to Google Calendar
                            <ExternalLink size={11} />
                          </button>
                          <button
                            className="text-button"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                'calendarFile',
                                { id: r.id },
                                'Calendar file saved. Open it with your calendar app.',
                              )
                            }
                          >
                            <Download size={14} />
                            Calendar file
                          </button>
                        </div>
                      </div>
                      <div className="reminder-side">
                        {!r.completed && (
                          <button
                            className="icon-button"
                            title="Snooze 15 minutes"
                            aria-label="Snooze 15 minutes"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                'snoozeReminder',
                                { id: r.id },
                                'A little breathing room. Snoozed for 15 minutes.',
                              )
                            }
                          >
                            <Clock size={17} />
                          </button>
                        )}
                        <button
                          className="icon-button"
                          title="Edit reminder"
                          aria-label="Edit reminder"
                          onClick={() => setDialog({ kind: 'reminder', reminder: r })}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              {!reminders.some((r) => r.completed === completed) && (
                <Empty
                  title={completed ? 'Nothing completed yet' : 'All caught up!'}
                  description={
                    completed
                      ? 'Finished reminders will be waiting here.'
                      : 'Add a reminder for a report, a follow-up, or a little time to think.'
                  }
                />
              )}
              <div className="gentle-footer">
                <Bell size={15} />
                <span>
                  Reminders pop up while Research Buddy is running. Close the window to keep it in
                  the tray; Quit stops reminders.
                </span>
              </div>
            </>
          )}
          {view === 'journal' && (
            <>
              <div className="heading-with-action">
                <PageHeading
                  eyebrow="THINK IT THROUGH"
                  title="Keep the why, not just the what."
                  description="A home for your thesis, your doubts, and the things that might change your mind."
                />
                <button className="button primary" onClick={() => setDialog({ kind: 'journal' })}>
                  <Plus size={16} />
                  New journal entry
                </button>
              </div>
              {latestEntries.length ? (
                <div className="journal-list">
                  {latestEntries.map((j) => (
                    <article className="journal-card" key={j.id}>
                      <div className="journal-date">
                        <NotebookPen size={16} />
                        {prettyTime(j.createdAt)}
                        <button
                          className="text-button"
                          onClick={() => setDialog({ kind: 'journal', entry: j })}
                        >
                          <Pencil size={14} />
                          Revise
                        </button>
                      </div>
                      <h3>My thinking</h3>
                      <p className="journal-thesis">{j.thesis}</p>
                      {j.counterarguments && (
                        <>
                          <h4>The other side</h4>
                          <p>{j.counterarguments}</p>
                        </>
                      )}
                      {j.conditions && (
                        <>
                          <h4>What would change my mind</h4>
                          <p>{j.conditions}</p>
                        </>
                      )}
                      {j.evidence.length > 0 && (
                        <div className="journal-evidence">
                          {j.evidence.map((c, i) => (
                            <button key={i} className="source-button" onClick={() => citation(c)}>
                              Evidence {i + 1}
                              <ArrowUpRight size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                      <details>
                        <summary>
                          <History size={14} />
                          Revision history ({entries.filter((e) => e.entryId === j.entryId).length})
                        </summary>
                        {entries
                          .filter((e) => e.entryId === j.entryId)
                          .map((e) => (
                            <div className="history-entry" key={e.id}>
                              <time>{prettyTime(e.createdAt)}</time>
                              <p>{e.thesis}</p>
                              {e.counterarguments && (
                                <>
                                  <h4>The other side</h4>
                                  <p>{e.counterarguments}</p>
                                </>
                              )}
                              {e.conditions && (
                                <>
                                  <h4>What would change my mind</h4>
                                  <p>{e.conditions}</p>
                                </>
                              )}
                              {e.evidence.map((c, i) => (
                                <button
                                  key={i}
                                  className="source-button"
                                  onClick={() => citation(c)}
                                >
                                  Evidence {i + 1}
                                  <ArrowUpRight size={12} />
                                </button>
                              ))}
                            </div>
                          ))}
                      </details>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Good research leaves a trail"
                  description="Write what you think, why you think it, and what would change your mind. Earlier versions stay safe when you revise."
                />
              )}
            </>
          )}
          {view === 'settings' && (
            <>
              <PageHeading
                eyebrow="MAKE YOURSELF AT HOME"
                title="Your buddy, your way."
                description="A few simple things to help Research Buddy fit into your day."
              />
              <div className="settings-grid">
                <FoxSettings
                  settings={data.settings}
                  runtime={data.companion}
                  busy={!!busy}
                  onChange={changeFoxSettings}
                />
                <section className="settings-card">
                  <h2>
                    <Bell size={19} />
                    Gentle reminders
                  </h2>
                  <SettingToggle
                    label="Show desktop notifications"
                    detail="Allow notifications for Research Buddy in Windows, too."
                    checked={data.settings.notifications}
                    onChange={(v) => toggleSetting('notifications', v)}
                  />
                  <p className="settings-help">
                    Keep Research Buddy running in your system tray for reminders. Missed reminders
                    appear when you open the app again.
                  </p>
                  <hr />
                  <h3>
                    <CalendarDays size={17} />
                    Google Calendar
                  </h3>
                  <p>
                    Use <strong>Add to Google Calendar</strong> on any reminder. Your browser opens
                    a filled-in event, and you click <strong>Save</strong>. No API key, account
                    connection, or sync needed.
                  </p>
                </section>
                <section className="settings-card">
                  <h2>
                    <Download size={19} />
                    Keep a copy
                  </h2>
                  <p>
                    Export {project?.name} as readable Markdown, with sources, summaries, journal
                    history, and reminders.
                  </p>
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() => run('export', { projectId }, 'Your research folder is ready.')}
                  >
                    <Download size={16} />
                    Export this workspace
                  </button>
                  <p className="settings-help">
                    Exports are for reading and sharing. Automatic backup and restore are not
                    included yet.
                  </p>
                </section>
                <section className="settings-card">
                  <h2>
                    <ShieldCheck size={19} />A private little notebook
                  </h2>
                  <p>
                    Your research is saved on this computer. Quick summaries and passage search work
                    on your device and don’t send your notes anywhere.
                  </p>
                  <p className="settings-help">
                    Local files aren’t encrypted. Imported notes aren’t live market data. Quick
                    summary selects key passages; it doesn’t replace reading the full source.
                  </p>
                  <span className="version">RESEARCH BUDDY · EARLY ACCESS 0.4</span>
                </section>
              </div>
            </>
          )}
        </div>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <span>
            {toast.error ? 'Something needs a little attention. ' : ''}
            {toast.text}
          </span>
          <button aria-label="Dismiss message" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          title={
            dialog.kind === 'note'
              ? dialog.note
                ? 'Edit your note'
                : 'A new little thought'
              : dialog.kind === 'reminder'
                ? dialog.reminder
                  ? 'Edit reminder'
                  : 'A gentle reminder'
                : dialog.kind === 'project'
                  ? 'A space for your ideas'
                  : dialog.kind === 'journal'
                    ? dialog.entry
                      ? 'Revise your thinking'
                      : 'Write it down'
                    : 'Supporting passage'
          }
          onClose={closeDialog}
          wide={dialog.kind === 'note' || dialog.kind === 'source'}
        >
          {dialog.kind === 'note' && (
            <NoteForm
              note={dialog.note}
              imported={dialog.imported}
              busy={!!busy}
              onCancel={closeDialog}
              onSave={async (fields) => {
                const n = await run<Note>(
                  'saveNote',
                  { ...fields, projectId, id: dialog.note?.id },
                  'Your note is tucked away safely.',
                );
                if (n) {
                  setSelected(n.id);
                  setView('notes');
                  closeDialog();
                }
              }}
            />
          )}
          {dialog.kind === 'project' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                const p = await run<Project>(
                  'createProject',
                  { name: fields.get('name'), ticker: fields.get('ticker') },
                  'A fresh space for your ideas.',
                );
                if (p) {
                  setProjectId(p.id);
                  setSelected(null);
                  setView('notes');
                  closeDialog();
                }
              }}
            >
              <p className="form-intro">
                A company, a class, or a project — give your research its own home.
              </p>
              <label>
                Workspace name
                <input name="name" required maxLength={80} placeholder="e.g. Company research" />
              </label>
              <label>
                Stock ticker <span className="optional">optional</span>
                <input name="ticker" maxLength={20} placeholder="e.g. AAPL" />
              </label>
              <FormActions busy={!!busy} onCancel={closeDialog} label="Create workspace" />
            </form>
          )}
          {dialog.kind === 'reminder' && (
            <ReminderForm
              reminder={dialog.reminder}
              suggestedTitle={note ? `Review ${note.title}` : undefined}
              busy={!!busy}
              onCancel={closeDialog}
              onSave={async (fields) => {
                const r = await run<Reminder>(
                  'saveReminder',
                  {
                    ...fields,
                    id: dialog.reminder?.id,
                    projectId: dialog.reminder?.projectId || projectId,
                  },
                  'I’ll give you a gentle nudge when it’s time.',
                );
                if (r) closeDialog();
              }}
            />
          )}
          {dialog.kind === 'journal' && (
            <JournalForm
              entry={dialog.entry}
              prefill={dialog.prefill}
              busy={!!busy}
              onCancel={closeDialog}
              onSave={async (fields) => {
                const j = await run(
                  'saveJournal',
                  {
                    ...fields,
                    projectId,
                    entryId: dialog.entry?.entryId,
                    evidence: dialog.entry?.evidence ?? dialog.evidence ?? [],
                  },
                  'Your thinking is saved. Earlier versions stay safe.',
                );
                if (j) closeDialog();
              }}
            />
          )}
          {dialog.kind === 'source' && (
            <div className="source-dialog">
              <span className="small-pill">
                SAVED SOURCE · {dialog.note.publishedOn || 'DATE UNKNOWN'}
              </span>
              <h3>{dialog.note.title}</h3>
              <blockquote>{dialog.quote}</blockquote>
              <details>
                <summary>Read the full saved note</summary>
                <div className="note-body">{dialog.note.body}</div>
              </details>
              <p className="form-hint">
                This is the saved version used in the summary. Editing the current note won’t change
                this evidence.
              </p>
              <button className="button primary" onClick={closeDialog}>
                Back to my research
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function ResearchCard({
  result,
  onCitation,
  onJournal,
}: {
  result: ResearchResult;
  onCitation: (c: Citation) => void;
  onJournal: () => void;
}) {
  return (
    <section className="research-card">
      <div className="research-card-header">
        <span>
          <Sparkles size={18} /> {result.kind === 'summary' ? 'A little clarity' : 'What I found'}
        </span>
        <span className="small-pill">ON YOUR DEVICE</span>
      </div>
      <p className="research-explainer">
        {result.kind === 'summary'
          ? 'Key passages, picked on your device'
          : 'Matching passages from this workspace'}
      </p>
      {result.kind === 'answer' && <h3 className="asked-question">{result.title}</h3>}
      <div className="takeaways">
        {result.points.map((p, i) => (
          <div className="takeaway" key={i}>
            <span className="takeaway-number">{i + 1}</span>
            <div>
              <p>{p.text}</p>
              <button className="source-button" onClick={() => onCitation(p.citation)}>
                See source
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {result.openQuestions.map((q, i) => (
        <p className="research-note" key={i}>
          {q}
        </p>
      ))}
      {result.points.length > 0 && (
        <button className="button secondary journal-copy" onClick={onJournal}>
          <NotebookPen size={15} />
          Start a journal entry
        </button>
      )}
      <p className="research-timestamp">
        Saved {prettyTime(result.createdAt)} · Local passage selection, not AI
      </p>
    </section>
  );
}
function FormActions({
  busy,
  onCancel,
  label,
}: {
  busy: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="form-actions">
      <button type="button" className="button secondary" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? 'Saving…' : label}
        <Check size={16} />
      </button>
    </div>
  );
}
function NoteForm({
  note,
  imported,
  busy,
  onCancel,
  onSave,
}: {
  note?: Note;
  imported?: { title: string; body: string };
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: { title: string; body: string; url: string; publishedOn: string }) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          title: String(f.get('title')),
          body: String(f.get('body')),
          url: String(f.get('url')),
          publishedOn: String(f.get('publishedOn')),
        });
      }}
    >
      <p className="form-intro">
        Drop in your research, a rough thought, or something worth coming back to.
      </p>
      <label>
        Note title
        <input
          name="title"
          defaultValue={note?.title ?? imported?.title}
          required
          maxLength={200}
          placeholder="Give this thought a name"
        />
      </label>
      <label>
        Your notes
        <textarea
          name="body"
          rows={9}
          defaultValue={note?.body ?? imported?.body}
          required
          maxLength={150000}
          placeholder="Start anywhere. It doesn’t have to be perfect."
        />
      </label>
      <details className="optional-details">
        <summary>
          Add a source link or publication date <span className="optional">optional</span>
        </summary>
        <div className="form-row">
          <label>
            Source link
            <input type="url" name="url" defaultValue={note?.url} placeholder="https://…" />
          </label>
          <label>
            Publication date
            <input type="date" name="publishedOn" defaultValue={note?.publishedOn} />
          </label>
        </div>
      </details>
      <FormActions busy={busy} onCancel={onCancel} label="Save note" />
    </form>
  );
}
function ReminderForm({
  reminder,
  suggestedTitle,
  busy,
  onCancel,
  onSave,
}: {
  reminder?: Reminder;
  suggestedTitle?: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: {
    title: string;
    details: string;
    dueAt: string;
    durationMinutes: number;
  }) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          title: String(f.get('title')),
          details: String(f.get('details')),
          dueAt: new Date(String(f.get('dueAt'))).toISOString(),
          durationMinutes: Number(f.get('duration')),
        });
      }}
    >
      <p className="form-intro">A follow-up, an earnings report, or just a little time to think.</p>
      <label>
        What would you like to remember?
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={reminder?.title ?? suggestedTitle}
          placeholder="e.g. Read the quarterly report"
        />
      </label>
      <div className="form-row">
        <label>
          Date and time
          <input
            name="dueAt"
            type="datetime-local"
            required
            defaultValue={localDate(reminder?.dueAt)}
          />
        </label>
        <label>
          Time to set aside
          <select name="duration" defaultValue={reminder?.durationMinutes ?? 30}>
            {[5, 15, 30, 45, 60, 90, 120, 240, 480, 1440].map((v) => (
              <option key={v} value={v}>
                {v < 60 ? `${v} minutes` : v === 1440 ? '24 hours' : `${v / 60} hours`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        A little context <span className="optional">optional</span>
        <textarea
          name="details"
          rows={3}
          maxLength={5000}
          defaultValue={reminder?.details}
          placeholder="Anything you’ll want to remember later…"
        />
      </label>
      <p className="form-hint">
        <Bell size={14} />
        Keep Research Buddy running for desktop reminders. You can add this to your calendar after
        saving.
      </p>
      <FormActions busy={busy} onCancel={onCancel} label="Save reminder" />
    </form>
  );
}
function JournalForm({
  entry,
  prefill,
  busy,
  onCancel,
  onSave,
}: {
  entry?: JournalEntry;
  prefill?: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: { thesis: string; counterarguments: string; conditions: string }) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          thesis: String(f.get('thesis')),
          counterarguments: String(f.get('counterarguments')),
          conditions: String(f.get('conditions')),
        });
      }}
    >
      <p className="form-intro">
        Think out loud. Your earlier versions will stay right where you left them.
      </p>
      <label>
        What do you think?
        <textarea
          name="thesis"
          required
          rows={5}
          maxLength={20000}
          defaultValue={entry?.thesis ?? prefill}
          placeholder="My current thinking is…"
        />
      </label>
      <label>
        What’s the other side? <span className="optional">optional</span>
        <textarea
          name="counterarguments"
          rows={3}
          maxLength={20000}
          defaultValue={entry?.counterarguments}
          placeholder="The strongest argument against this is…"
        />
      </label>
      <label>
        What would change your mind? <span className="optional">optional</span>
        <textarea
          name="conditions"
          rows={3}
          maxLength={20000}
          defaultValue={entry?.conditions}
          placeholder="I’d reconsider if…"
        />
      </label>
      <FormActions busy={busy} onCancel={onCancel} label="Save journal entry" />
    </form>
  );
}
