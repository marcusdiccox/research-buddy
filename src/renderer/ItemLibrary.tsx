import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Bell, BookOpen, Folder, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { LibraryGroup, LibraryItemRef, Note, Reminder, Snapshot } from '../shared/contracts';
import './library.css';

export interface ItemLibraryProps {
  data: Snapshot;
  onRefresh: () => Promise<void>;
  onOpen: (ref: LibraryItemRef) => void;
  onDeleted?: (refs: LibraryItemRef[]) => void;
  onBack: () => void;
}

type SavedItem = {
  key: string;
  ref: LibraryItemRef;
  title: string;
  preview: string;
  date: string;
  groupId?: string;
  reminder?: Reminder;
};
type GroupEditor = { kind: 'create' | 'rename'; id?: string; name: string; createdId?: string };
const keyOf = (ref: LibraryItemRef) => `${ref.kind}:${ref.id}`;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
function readableDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export function ItemLibrary({ data, onRefresh, onOpen, onDeleted, onBack }: ItemLibraryProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [moveGroup, setMoveGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SavedItem[] | null>(null);
  const [groupEditor, setGroupEditor] = useState<GroupEditor | null>(null);
  const [moveIntoNewGroup, setMoveIntoNewGroup] = useState(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const groupDialog = useRef<HTMLDialogElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const inTrash = group === 'trash';
  const groups = data.library.groups;

  const items = useMemo(() => {
    const metadata = new Map(data.library.items.map((item) => [item.id, item]));
    const source = inTrash ? data.library.trash : data;
    const noteItem = (note: Note): SavedItem => {
      const ref: LibraryItemRef = { kind: 'note', id: note.id };
      const key = keyOf(ref);
      return {
        key,
        ref,
        title: note.title || 'Untitled note',
        preview: note.body,
        date: note.updatedAt,
        groupId: metadata.get(key)?.groupId,
      };
    };
    const reminderItem = (reminder: Reminder): SavedItem => {
      const ref: LibraryItemRef = { kind: 'reminder', id: reminder.id };
      const key = keyOf(ref);
      return {
        key,
        ref,
        title: reminder.title || 'Untitled reminder',
        preview: reminder.details,
        date: reminder.createdAt,
        groupId: metadata.get(key)?.groupId,
        reminder,
      };
    };
    return [...source.notes.map(noteItem), ...source.reminders.map(reminderItem)]
      .filter((item) => inTrash || !metadata.get(item.key)?.deletedAt)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, inTrash]);

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        (!search || `${item.title} ${item.preview}`.toLocaleLowerCase().includes(search)) &&
        (type === 'all' ||
          (type === 'notes' && item.ref.kind === 'note') ||
          (type === 'reminders' && item.ref.kind === 'reminder') ||
          (type === 'completed' && item.reminder?.completed)) &&
        (group === 'all' ||
          group === 'trash' ||
          (group === 'ungrouped' ? !item.groupId : item.groupId === group.slice(6))),
    );
  }, [items, query, type, group]);
  const selectedItems = visible.filter((item) => selected.has(item.key));
  const selectedRefs = selectedItems.map((item) => item.ref);

  useEffect(() => {
    setSelected((current) => {
      const available = new Set(visible.map((item) => item.key));
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [visible]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate =
        selectedItems.length > 0 && selectedItems.length < visible.length;
  }, [selectedItems.length, visible.length]);
  useEffect(() => {
    if (group.startsWith('group:') && !groups.some((entry) => `group:${entry.id}` === group)) {
      setGroup('all');
      setSelected(new Set());
    }
    if (moveGroup && !groups.some((entry) => entry.id === moveGroup)) setMoveGroup('');
  }, [groups, group, moveGroup]);
  useEffect(() => {
    const dialog = deleteDialog.current;
    if (pendingDelete && dialog && !dialog.open) dialog.showModal();
    else if (!pendingDelete && dialog?.open) dialog.close();
  }, [pendingDelete]);
  useEffect(() => {
    const dialog = groupDialog.current;
    if (groupEditor && dialog && !dialog.open) dialog.showModal();
    else if (!groupEditor && dialog?.open) dialog.close();
  }, [groupEditor]);

  function changeFilter(change: () => void) {
    change();
    setSelected(new Set());
    setNotice('');
  }
  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setRefreshFailed(false);
    try {
      if (!window.buddy) throw new Error('Open Pip’s notebook from the desktop app.');
      await action();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function refreshAfterChange(message: string) {
    setNotice(message);
    try {
      await onRefresh();
    } catch (failure) {
      setRefreshFailed(true);
      setError(`Your change was saved, but the list could not refresh. ${messageOf(failure)}`);
    }
  }
  function newGroup() {
    setMoveIntoNewGroup(selectedRefs.length > 0 && !inTrash);
    setGroupEditor({ kind: 'create', name: '' });
  }
  function saveGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupEditor?.name.trim()) return;
    const editor = groupEditor;
    void perform(async () => {
      if (editor.kind === 'rename') {
        await window.buddy!.call('renameLibraryGroup', { id: editor.id, name: editor.name.trim() });
      } else {
        let id = editor.createdId;
        if (!id) {
          const created = await window.buddy!.call<LibraryGroup>('createLibraryGroup', {
            name: editor.name.trim(),
          });
          id = created.id;
          // Keep the new ID if assigning the selected items fails, so retry cannot create duplicates.
          setGroupEditor((current) => (current ? { ...current, createdId: id } : current));
        }
        if (moveIntoNewGroup && selectedRefs.length) {
          await window.buddy!.call('groupItems', { items: selectedRefs, groupId: id });
          setSelected(new Set());
        }
        setMoveGroup(id);
      }
      setGroupEditor(null);
      await refreshAfterChange(editor.kind === 'create' ? 'Group created.' : 'Group renamed.');
    });
  }
  function restore(refs: LibraryItemRef[]) {
    void perform(async () => {
      await window.buddy!.call('restoreItems', { items: refs });
      setSelected(new Set());
      await refreshAfterChange(`${refs.length === 1 ? 'Item' : `${refs.length} items`} restored.`);
    });
  }
  function confirmDelete() {
    if (!pendingDelete) return;
    const refs = pendingDelete.map((item) => item.ref);
    void perform(async () => {
      await window.buddy!.call('trashItems', { items: refs });
      onDeleted?.(refs);
      setPendingDelete(null);
      setSelected(new Set());
      await refreshAfterChange(
        `${refs.length === 1 ? 'Item' : `${refs.length} items`} moved to Trash.`,
      );
    });
  }

  return (
    <section className="item-library" aria-label="Saved items" aria-busy={busy}>
      <div className="library-heading">
        <h2>
          <BookOpen size={17} aria-hidden="true" /> Saved items
        </h2>
        <button type="button" className="compact-text-button" onClick={onBack} disabled={busy}>
          <ArrowLeft size={13} aria-hidden="true" /> Back
        </button>
      </div>
      <fieldset className="library-controls" disabled={busy}>
        <label>
          Search saved items
          <input
            type="search"
            placeholder="Find a title, note or reminder…"
            value={query}
            onChange={(event) => changeFilter(() => setQuery(event.target.value))}
          />
        </label>
        <div className="library-filter-row">
          <label>
            Item type
            <select
              value={type}
              onChange={(event) => changeFilter(() => setType(event.target.value))}
            >
              <option value="all">All items</option>
              <option value="notes">Notes</option>
              <option value="reminders">Reminders</option>
              <option value="completed">Completed reminders</option>
            </select>
          </label>
          <label>
            Library group
            <select
              value={group}
              onChange={(event) => changeFilter(() => setGroup(event.target.value))}
            >
              <option value="all">All groups</option>
              <option value="ungrouped">Ungrouped</option>
              {groups.map((entry) => (
                <option key={entry.id} value={`group:${entry.id}`}>
                  {entry.name}
                </option>
              ))}
              <option value="trash">Trash</option>
            </select>
          </label>
        </div>
      </fieldset>
      <div className="library-group-tools">
        <details className="library-groups">
          <summary>
            <Folder size={13} aria-hidden="true" /> Groups <span>({groups.length})</span>
          </summary>
          <div className="library-group-manager">
            {groups.map((entry) => (
              <div className="library-group-row" key={entry.id}>
                <span>{entry.name}</span>
                <button
                  type="button"
                  className="compact-text-button"
                  aria-label={`Rename ${entry.name}`}
                  disabled={busy}
                  onClick={() => setGroupEditor({ kind: 'rename', id: entry.id, name: entry.name })}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="compact-text-button"
                  aria-label={`Remove group ${entry.name}`}
                  title="Remove group; its items become ungrouped"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await window.buddy!.call('removeLibraryGroup', { id: entry.id });
                      await refreshAfterChange('Group removed. Its items are ungrouped.');
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <p className="compact-hint">Removing a group keeps its items in Ungrouped.</p>
          </div>
        </details>
        <button type="button" className="compact-text-button" onClick={newGroup} disabled={busy}>
          <Plus size={12} aria-hidden="true" /> New group
        </button>
      </div>
      {error && (
        <div className="library-error" role="alert">
          {error}
          {refreshFailed && (
            <button
              type="button"
              className="compact-text-button"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await refreshAfterChange('List refreshed.');
                })
              }
            >
              Refresh list
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="library-notice" role="status">
          {notice}
        </p>
      )}
      <div className="library-selection-row">
        <label className="compact-checkbox">
          <input
            ref={selectAll}
            type="checkbox"
            checked={visible.length > 0 && selectedItems.length === visible.length}
            disabled={busy || visible.length === 0}
            onChange={(event) =>
              setSelected(
                event.target.checked ? new Set(visible.map((item) => item.key)) : new Set(),
              )
            }
          />{' '}
          Select all visible
        </label>
        <span>
          {selectedItems.length
            ? `${selectedItems.length} selected`
            : `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`}
        </span>
      </div>
      {selectedItems.length > 0 && (
        <fieldset className="library-bulk" disabled={busy} aria-label="Selected item actions">
          {inTrash ? (
            <button
              type="button"
              className="compact-secondary"
              onClick={() => restore(selectedRefs)}
            >
              <RotateCcw size={13} aria-hidden="true" /> Restore selected
            </button>
          ) : (
            <>
              <div className="library-move-row">
                <select
                  aria-label="Move selected to group"
                  value={moveGroup}
                  onChange={(event) => setMoveGroup(event.target.value)}
                >
                  <option value="">Ungrouped</option>
                  {groups.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="compact-secondary"
                  onClick={() =>
                    void perform(async () => {
                      await window.buddy!.call('groupItems', {
                        items: selectedRefs,
                        groupId: moveGroup,
                      });
                      setSelected(new Set());
                      await refreshAfterChange('Selected items moved.');
                    })
                  }
                >
                  Move selected
                </button>
              </div>
              <div className="library-bulk-buttons">
                <button
                  type="button"
                  className="compact-text-button library-delete"
                  onClick={() => setPendingDelete(selectedItems)}
                >
                  <Trash2 size={12} aria-hidden="true" /> Delete selected
                </button>
              </div>
            </>
          )}
        </fieldset>
      )}
      <div
        className="library-list"
        tabIndex={0}
        aria-label={inTrash ? 'Trashed items' : 'Saved item results'}
      >
        {!visible.length ? (
          <div className="library-empty">
            <BookOpen size={23} aria-hidden="true" />
            <p>
              {query.trim() || type !== 'all'
                ? 'No matching items.'
                : inTrash
                  ? 'Trash is empty.'
                  : group === 'all'
                    ? 'No saved items yet.'
                    : 'No items in this group.'}
            </p>
            <span>
              {query.trim() || type !== 'all'
                ? 'Try another search or filter.'
                : inTrash
                  ? 'Deleted notes and reminders appear here until restored.'
                  : 'Your saved notes and reminders will appear here.'}
            </span>
          </div>
        ) : (
          <ul>
            {visible.map((item) => (
              <li className="library-card" key={item.key}>
                <input
                  className="library-item-check"
                  type="checkbox"
                  aria-label={`Select ${item.title}`}
                  checked={selected.has(item.key)}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(item.key);
                      else next.delete(item.key);
                      return next;
                    });
                  }}
                />
                <div className="library-card-content">
                  <div className="library-item-type">
                    {item.ref.kind === 'note' ? (
                      <BookOpen size={11} aria-hidden="true" />
                    ) : (
                      <Bell size={11} aria-hidden="true" />
                    )}
                    {item.ref.kind === 'note' ? 'Note' : 'Reminder'}
                    {item.groupId && (
                      <span className="library-group-tag">
                        {groups.find((entry) => entry.id === item.groupId)?.name}
                      </span>
                    )}
                  </div>
                  <h3>{item.title}</h3>
                  {item.preview && (
                    <p className="library-preview">
                      {item.preview.replace(/\s+/g, ' ').trim().slice(0, 220)}
                    </p>
                  )}
                  <p className="library-item-meta">
                    {item.reminder ? (
                      <>
                        <span className={item.reminder.completed ? 'library-completed' : ''}>
                          {item.reminder.completed
                            ? 'Completed'
                            : new Date(item.reminder.dueAt).getTime() < Date.now()
                              ? 'Overdue'
                              : 'Upcoming'}
                        </span>{' '}
                        · {readableDate(item.reminder.dueAt)}
                      </>
                    ) : (
                      <>Updated {readableDate(item.date)}</>
                    )}
                  </p>
                  <div className="library-item-actions">
                    {inTrash ? (
                      <button
                        type="button"
                        className="compact-text-button"
                        aria-label={`Restore ${item.title}`}
                        disabled={busy}
                        onClick={() => restore([item.ref])}
                      >
                        <RotateCcw size={12} aria-hidden="true" /> Restore
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="compact-secondary"
                          aria-label={`Open ${item.ref.kind} ${item.title}`}
                          disabled={busy}
                          onClick={() => onOpen(item.ref)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="compact-text-button library-delete"
                          aria-label={`Delete ${item.title}`}
                          disabled={busy}
                          onClick={() => setPendingDelete([item])}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <dialog
        className="library-dialog"
        ref={deleteDialog}
        aria-labelledby="library-trash-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busyRef.current) setPendingDelete(null);
        }}
      >
        <h2 id="library-trash-title">
          Move {pendingDelete?.length ?? 0} {(pendingDelete?.length ?? 0) === 1 ? 'item' : 'items'}{' '}
          to Trash?
        </h2>
        <p>
          Saved content can be restored from Trash. Unsaved edits to these items will be discarded.
        </p>
        {pendingDelete?.some((item) => item.reminder?.calendarSync) && (
          <p>Calendar events already synced to Google remain in Google Calendar.</p>
        )}
        {error && (
          <p className="library-error" role="alert">
            {error}
          </p>
        )}
        <div className="library-dialog-actions">
          <button
            type="button"
            className="compact-secondary"
            disabled={busy}
            onClick={() => setPendingDelete(null)}
          >
            Cancel
          </button>
          <button type="button" className="compact-primary" disabled={busy} onClick={confirmDelete}>
            {busy ? 'Moving…' : 'Move to Trash'}
          </button>
        </div>
      </dialog>
      <dialog
        className="library-dialog"
        ref={groupDialog}
        aria-labelledby="library-group-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busyRef.current) setGroupEditor(null);
        }}
      >
        <form onSubmit={saveGroup}>
          <h2 id="library-group-title">
            {groupEditor?.kind === 'rename' ? 'Rename group' : 'New group'}
          </h2>
          <label>
            Group name
            <input
              autoFocus
              required
              maxLength={60}
              value={groupEditor?.name ?? ''}
              disabled={busy || !!groupEditor?.createdId}
              onChange={(event) => {
                const name = event.target.value;
                setGroupEditor((current) => (current ? { ...current, name } : current));
              }}
            />
          </label>
          {groupEditor?.kind === 'create' && selectedRefs.length > 0 && !inTrash && (
            <label className="compact-checkbox library-new-group-move">
              <input
                type="checkbox"
                checked={moveIntoNewGroup}
                disabled={busy || !!groupEditor.createdId}
                onChange={(event) => setMoveIntoNewGroup(event.target.checked)}
              />{' '}
              Move {selectedRefs.length} selected {selectedRefs.length === 1 ? 'item' : 'items'}{' '}
              into this group
            </label>
          )}
          {error && (
            <p className="library-error" role="alert">
              {error}
            </p>
          )}
          <div className="library-dialog-actions">
            <button
              type="button"
              className="compact-secondary"
              disabled={busy}
              onClick={() => setGroupEditor(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="compact-primary"
              disabled={busy || !groupEditor?.name.trim()}
            >
              {busy
                ? 'Saving…'
                : groupEditor?.kind === 'rename'
                  ? 'Save group'
                  : groupEditor?.createdId
                    ? 'Retry moving items'
                    : 'Create group'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
