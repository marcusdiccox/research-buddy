import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
  Tray,
  Menu,
  nativeImage,
  screen,
  safeStorage,
} from 'electron';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { BuddyStore, text } from '../core/store.js';
import { backupNotebook } from '../core/backups.js';
import { summarize, answerFromNotes } from '../core/research.js';
import { googleCalendarUrl, calendarFile } from '../core/calendar.js';
import { exportDossier } from '../core/export.js';
import { deliverScheduledReminders } from '../core/notifications.js';
import { ReminderChannel } from '../core/reminder-channel.js';
import { FocusSession } from '../core/focus.js';
import { REMINDER_LEAD_MINUTES, formatReminderAlert } from '../core/reminder-policy.js';
import { EventEmitter } from 'node:events';
import { CompanionController } from './companion.js';
import { WindowsStartup } from './startup.js';
import electronUpdater from 'electron-updater';
import { UpdateController } from './updates.js';
import { placeWritingBubble } from '../core/popover.js';
import { CalendarSync, type CalendarConnection } from '../core/calendar-sync.js';
import type {
  NoteDraft,
  JournalDraft,
  ReminderDraft,
  Settings,
  NotebookLaunch,
  NotebookAction,
  LibraryItemRef,
} from '../shared/contracts.js';

const here = dirname(fileURLToPath(import.meta.url));
const testMode = process.env.BUDDY_TEST === '1';
if (process.env.RESEARCH_BUDDY_DATA_DIR)
  app.setPath('userData', resolve(process.env.RESEARCH_BUDDY_DATA_DIR));
app.setName('Research Buddy');
app.setAppUserModelId('com.researchbuddy.desktop');
const startup = new WindowsStartup(app, {
  executable: process.execPath,
  platform: process.platform,
  installed:
    app.isPackaged && existsSync(join(dirname(process.execPath), 'Uninstall Research Buddy.exe')),
  testMode,
});
let updates: UpdateController | undefined;
let workspace: BrowserWindow | undefined,
  companion: CompanionController | undefined,
  notepad: BrowserWindow | undefined,
  writingBubble: BrowserWindow | undefined,
  foxSettings: BrowserWindow | undefined,
  calendar: CalendarSync | undefined,
  tray: Tray | undefined,
  db: BuddyStore,
  quitting = false;
let notepadReady: Promise<void> | undefined,
  settingsReady: Promise<void> | undefined,
  bubbleReady: Promise<void> | undefined;
let bubbleLayout = {
  tailX: 180,
  tailSide: 'bottom' as 'top' | 'bottom',
  action: 'notes' as 'notes' | 'reminder' | 'calendar',
};
let notebookLaunch: NotebookLaunch = { action: 'notes' };
const notices = new Set<Notification>();
const foregroundReminders = new ReminderChannel();
// Focus deliberately stays in memory: quitting ends the session.
const focus = new FocusSession();
const iconPath = join(here, '../../assets/pip.png');
function changed() {
  if (db && !db.settings().petVisible && writingBubble?.isVisible()) writingBubble.hide();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('buddy:changed');
}
function focusStatus() {
  const now = Date.now();
  if (focus.tick(now)) {
    companion?.setFocusActive(false);
    if (companion?.canRemind)
      companion.remind(
        `focus:${now}`,
        () => 'Focus finished. Nice work!',
        () => {},
        () => {},
      );
    changed();
  }
  return focus.status(now);
}
function showWorkspace() {
  workspace?.show();
  workspace?.focus();
}
function baseWindow(options: Electron.BrowserWindowConstructorOptions) {
  const win = new BrowserWindow({
    icon: iconPath,
    ...options,
    webPreferences: {
      ...options.webPreferences,
      preload: join(here, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  win.on('query-session-end', () => updates?.deferForSystemShutdown());
  win.on('session-end', () => updates?.deferForSystemShutdown());
  return win;
}
function load(win: BrowserWindow, hash = '') {
  return win.loadFile(join(here, '../../dist/index.html'), { hash });
}
async function showNotepad(
  action: 'notes' | 'reminder' | 'calendar' | 'library' = 'notes',
  noteId?: string,
  reminderId?: string,
) {
  const snapshot = db.snapshot();
  const note = snapshot.notes.find((n) => n.id === noteId),
    reminder = snapshot.reminders.find((r) => r.id === reminderId);
  notebookLaunch = {
    action,
    item: note
      ? { kind: 'note', note }
      : reminder
        ? { kind: action === 'calendar' ? 'calendar' : 'reminder', reminder }
        : undefined,
  };
  if (!notepad || notepad.isDestroyed()) {
    notepad = baseWindow({
      width: 520,
      height: 600,
      minWidth: 420,
      minHeight: 480,
      show: false,
      title: 'Pip’s notepad',
      backgroundColor: '#fbfaf6',
    });
    notepad.setMenuBarVisibility(false);
    notepad.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        notepad?.hide();
      }
    });
    notepadReady = load(notepad, 'notepad');
  }
  await notepadReady;
  notepad.show();
  notepad.focus();
  notepad.webContents.send('buddy:navigate', action);
  if (notebookLaunch.item) notepad.webContents.send('buddy:open-item', notebookLaunch.item);
}
async function showFoxSettings() {
  if (!foxSettings || foxSettings.isDestroyed()) {
    foxSettings = baseWindow({
      width: 340,
      height: 400,
      resizable: false,
      frame: false,
      thickFrame: false,
      transparent: true,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      title: 'Fox settings',
      backgroundColor: '#00000000',
    });
    foxSettings.setMenuBarVisibility(false);
    foxSettings.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        foxSettings?.hide();
      }
    });
    settingsReady = load(foxSettings, 'fox-settings');
  }
  await settingsReady;
  foxSettings.show();
  foxSettings.focus();
}
async function showBubble(action: 'notes' | 'reminder' | 'calendar' = 'notes') {
  bubbleLayout = { ...bubbleLayout, action };
  if (!db.settings().petVisible) companion?.show();
  if (!writingBubble || writingBubble.isDestroyed()) {
    writingBubble = baseWindow({
      width: 360,
      height: 340,
      show: false,
      frame: false,
      thickFrame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: db.settings().alwaysOnTop,
      title: 'Pip quick note',
    });
    writingBubble.setMenuBarVisibility(false);
    writingBubble.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        writingBubble?.hide();
      }
    });
    writingBubble.on('hide', () => companion?.setEngaged(false));
    writingBubble.on('blur', () => {
      setTimeout(() => {
        if (
          writingBubble &&
          !writingBubble.isDestroyed() &&
          !writingBubble.isFocused() &&
          !db.settings().bubblePinned
        )
          writingBubble.hide();
      }, 120);
    });
    bubbleReady = load(writingBubble, 'bubble');
  }
  await bubbleReady;
  const pet = companion?.window?.getBounds() ?? { x: 0, y: 0, width: 240, height: 260 };
  const area = screen.getDisplayMatching(pet).workArea;
  const placement = placeWritingBubble(pet, area, writingBubble.getBounds());
  bubbleLayout = { tailX: placement.tailX, tailSide: placement.tailSide, action };
  writingBubble.setBounds({ x: placement.x, y: placement.y, width: 360, height: 340 });
  writingBubble.setAlwaysOnTop(db.settings().bubblePinned || db.settings().alwaysOnTop);
  companion?.setEngaged(true);
  writingBubble.show();
  writingBubble.focus();
  writingBubble.webContents.send('buddy:navigate', action);
  changed();
}
function openNotepad(action: NotebookAction = 'notes') {
  void (
    action === 'settings'
      ? showFoxSettings()
      : action === 'library'
        ? showNotepad('library')
        : showBubble(action)
  ).catch(() =>
    dialog.showErrorBox('Pip could not open', 'Please restart Research Buddy and try again.'),
  );
}
function broadcastReminder(message: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('buddy:reminder', message);
  }
}
function deliverForegroundReminders() {
  foregroundReminders.tick(
    Date.now(),
    [writingBubble, notepad, workspace].some((w) => w && !w.isDestroyed() && w.isVisible()),
    broadcastReminder,
  );
}
function notifyDue() {
  if (!db) return;
  deliverScheduledReminders(
    db,
    (alert) => {
      const notice = new EventEmitter();
      const message = formatReminderAlert(alert);
      return Object.assign(notice, {
        show() {
          let finished = false;
          let pending = 0;
          const shown = () => {
            if (!finished) {
              finished = true;
              notice.emit('show');
            }
          };
          const failed = () => {
            pending--;
            if (!finished && pending === 0) {
              finished = true;
              notice.emit('failed');
            }
          };
          const key = `${alert.reminder.id}:${alert.reminder.dueAt}:${alert.offsetMinutes}`;
          const read = () => {
            const current = db.findReminder(alert.reminder.id);
            const latest = REMINDER_LEAD_MINUTES.filter(
              (offset) => Date.parse(alert.reminder.dueAt) - offset * 60000 <= Date.now(),
            ).at(-1);
            return current &&
              !current.completed &&
              current.remindEnabled !== false &&
              current.dueAt === alert.reminder.dueAt &&
              latest === alert.offsetMinutes
              ? formatReminderAlert({ ...alert, reminder: current })
              : null;
          };
          // Foreground alerts share a readable slot rather than overwriting each other.
          pending++;
          foregroundReminders.enqueue(key, read, shown, failed);
          if (companion?.canRemind) {
            pending++;
            if (!companion.remind(key, read, shown, failed)) failed();
          }
          if (!testMode && db.settings().notifications && Notification.isSupported()) {
            pending++;
            try {
              const notification = new Notification({
                title: 'Pip reminder',
                body: message,
                silent: false,
              });
              notices.add(notification);
              notification.once('show', shown);
              notification.once('failed', failed);
              notification.on(
                'click',
                () => void showNotepad('reminder', undefined, alert.reminder.id),
              );
              notification.on('close', () => notices.delete(notification));
              notification.on('failed', () => notices.delete(notification));
              notification.show();
            } catch {
              failed();
            }
          }
          if (!finished && pending === 0) {
            finished = true;
            notice.emit('failed');
          }
        },
      });
    },
    new Date(),
    changed,
  );
  deliverForegroundReminders();
}
if (!testMode && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => openNotepad());
  app
    .whenReady()
    .then(async () => {
      mkdirSync(app.getPath('userData'), { recursive: true });
      const databasePath = join(app.getPath('userData'), 'research.sqlite');
      db = new BuddyStore(databasePath);
      if (!db.snapshot().projects.length) db.createProject({ name: 'My notebook' });
      const backUpNotebook = () => {
        const result = backupNotebook(databasePath);
        if (result.status === 'failed') console.warn('Notebook backup failed:', result.message);
      };
      backUpNotebook();
      setInterval(backUpNotebook, 30 * 60 * 1000).unref();
      const canUpdate =
        !testMode &&
        process.platform === 'win32' &&
        app.isPackaged &&
        existsSync(join(dirname(process.execPath), 'Uninstall Research Buddy.exe'));
      updates = new UpdateController(electronUpdater.autoUpdater, {
        enabled: canUpdate,
        currentVersion: app.getVersion(),
        onChange: changed,
      });
      if (canUpdate) {
        const checkUpdates = () => {
          if (!quitting) void updates?.check();
        };
        setTimeout(checkUpdates, 10000).unref();
        setInterval(checkUpdates, 6 * 60 * 60 * 1000).unref();
      }
      workspace = baseWindow({
        width: 1260,
        height: 850,
        minWidth: 860,
        minHeight: 650,
        backgroundColor: '#fbfaf6',
        show: false,
        title: 'Research Buddy',
      });
      workspace.setMenuBarVisibility(false);
      workspace.on('close', (e) => {
        if (!quitting && !testMode) {
          e.preventDefault();
          workspace?.hide();
        }
      });
      await load(workspace);
      const connectionFile = join(app.getPath('userData'), 'google-calendar.enc');
      calendar = new CalendarSync({
        store: db,
        openExternal: (url) => shell.openExternal(url),
        onChange: changed,
        load: () => {
          if (!existsSync(connectionFile)) return undefined;
          if (!safeStorage.isEncryptionAvailable())
            throw new Error('Secure storage is unavailable.');
          return JSON.parse(
            safeStorage.decryptString(readFileSync(connectionFile)),
          ) as CalendarConnection;
        },
        save: (value) => {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error(
              'Windows secure storage is unavailable. Google credentials were not saved.',
            );
          writeFileSync(connectionFile + '.tmp', safeStorage.encryptString(JSON.stringify(value)));
          renameSync(connectionFile + '.tmp', connectionFile);
        },
      });
      if (!testMode) {
        setInterval(() => void calendar?.sync(), 30000).unref();
        void calendar.sync();
      }
      companion = new CompanionController({
        store: db,
        createWindow: baseWindow,
        loadWindow: load,
        openNotebook: openNotepad,
        onChange: changed,
        autoShow: !testMode,
      });
      tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 }));
      tray.setToolTip('Research Buddy');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open Pip’s notepad', click: () => openNotepad() },
          { label: 'Companion settings', click: () => openNotepad('settings') },
          { label: 'All research tools', click: showWorkspace },
          {
            label: 'Show / hide Pip',
            click: () => {
              companion?.toggle();
            },
          },
          { type: 'separator' },
          {
            label: 'Quit Research Buddy',
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on('double-click', () => openNotepad());
      screen.on('display-removed', () => companion?.clamp());
      screen.on('display-metrics-changed', () => companion?.clamp());
      setInterval(deliverForegroundReminders, 250).unref();
      setInterval(focusStatus, 250).unref();
      setInterval(notifyDue, 15000).unref();
      setTimeout(notifyDue, 1500).unref();
    })
    .catch((error) => {
      dialog.showErrorBox('Research Buddy could not open', String(error));
      app.quit();
    });
}
app.on('before-quit', () => {
  quitting = true;
  focus.stop();
  companion?.dispose();
  calendar?.dispose();
});
app.on('will-quit', () => {
  companion?.dispose();
  db?.close();
});
app.on('activate', () => openNotepad());

ipcMain.handle('buddy', async (event, action: unknown, raw: unknown) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (
    !sender ||
    ![workspace, companion?.window, notepad, foxSettings, writingBubble].includes(sender) ||
    event.senderFrame !== event.sender.mainFrame
  )
    return { ok: false, error: 'This action is not available.' };
  try {
    if (typeof action !== 'string') throw new Error('Choose an available action.');
    const data = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<
      string,
      unknown
    >;
    const id = () => text(data.id, 'Item', 100),
      project = () => text(data.projectId, 'Workspace', 100);
    let value: unknown;
    switch (action) {
      case 'snapshot': {
        const snapshot = db.snapshot();
        value = {
          ...snapshot,
          settings: {
            ...snapshot.settings,
            startWithWindows: startup.status(snapshot.settings.startWithWindows),
          },
          companion: companion?.status,
          calendar: calendar?.status,
          focus: focusStatus(),
          updates: updates?.status,
        };
        break;
      }
      case 'focusStatus':
        value = focusStatus();
        break;
      case 'checkForUpdates':
        value = await updates?.check();
        break;
      case 'focusStart':
        value = focus.start(data.minutes);
        companion?.setFocusActive(true);
        break;
      case 'focusStop':
        value = focus.stop();
        companion?.setFocusActive(false);
        break;
      case 'createLibraryGroup':
        value = db.createLibraryGroup(data.name as string);
        break;
      case 'renameLibraryGroup':
        value = db.renameLibraryGroup(id(), data.name as string);
        break;
      case 'removeLibraryGroup':
        value = db.removeLibraryGroup(id());
        break;
      case 'groupItems':
        value = db.groupItems(
          data.items as LibraryItemRef[],
          data.groupId === undefined || data.groupId === ''
            ? undefined
            : text(data.groupId, 'Group', 100),
        );
        break;
      case 'trashItems':
        value = db.trashItems(data.items as LibraryItemRef[]);
        break;
      case 'restoreItems':
        value = db.restoreItems(data.items as LibraryItemRef[]);
        break;
      case 'createProject':
        value = db.createProject({
          name: data.name as string,
          ticker: data.ticker as string | undefined,
        });
        break;
      case 'saveNote':
        value = db.saveNote(data as unknown as NoteDraft);
        break;
      case 'importFile': {
        const result = await dialog.showOpenDialog(workspace!, {
          title: 'Choose a note',
          filters: [{ name: 'Text and Markdown notes', extensions: ['txt', 'md'] }],
          properties: ['openFile'],
        });
        if (result.canceled) {
          value = null;
          break;
        }
        const path = result.filePaths[0];
        if (
          !['.txt', '.md'].includes(extname(path).toLowerCase()) ||
          statSync(path).size > 2 * 1024 * 1024
        )
          throw new Error('Choose a text or Markdown file smaller than 2 MB.');
        let body: string;
        try {
          body = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path));
        } catch {
          throw new Error('This file is not UTF-8 text. Try copying and pasting the text instead.');
        }
        value = { title: basename(path, extname(path)), body };
        break;
      }
      case 'summary': {
        const note = db.getNote(project(), id());
        value = db.saveResult(summarize(note));
        break;
      }
      case 'ask': {
        const p = project(),
          q = text(data.question, 'Your question', 2000);
        value = db.saveResult(answerFromNotes(p, q, db.search(p, q)));
        break;
      }
      case 'revision':
        value = db.getRevision(project(), id());
        break;
      case 'saveJournal':
        value = db.saveJournal(data as unknown as JournalDraft);
        break;
      case 'saveReminder':
        value = db.saveReminder(data as unknown as ReminderDraft);
        notifyDue();
        break;
      case 'completeReminder':
        value = db.completeReminder(id(), data.completed as boolean);
        break;
      case 'snoozeReminder':
        value = db.snoozeReminder(id(), new Date(Date.now() + 15 * 60000).toISOString());
        break;
      case 'calendarPreview':
        value = googleCalendarUrl(db.getReminder(id()));
        break;
      case 'googleCalendar':
        await shell.openExternal(googleCalendarUrl(db.getReminder(id())));
        value = true;
        break;
      case 'calendarFile': {
        const r = db.getReminder(id()),
          result = await dialog.showSaveDialog(workspace!, {
            title: 'Save calendar event',
            defaultPath: 'research-buddy-event.ics',
            filters: [{ name: 'Calendar event', extensions: ['ics'] }],
          });
        if (result.canceled || !result.filePath) {
          value = null;
          break;
        }
        writeFileSync(result.filePath, calendarFile(r), 'utf8');
        value = true;
        break;
      }
      case 'export': {
        const p = project(),
          result = await dialog.showOpenDialog(workspace!, {
            title: 'Choose where to save your research',
            properties: ['openDirectory', 'createDirectory'],
          });
        if (result.canceled) {
          value = null;
          break;
        }
        const folder = exportDossier(db, p, result.filePaths[0]);
        shell.showItemInFolder(join(folder, 'README.md'));
        value = true;
        break;
      }
      case 'settings': {
        const previousStartup = db.settings().startWithWindows;
        const saved = db.saveSettings(data as Partial<Settings>);
        if ('startWithWindows' in data) {
          try {
            startup.set(data.startWithWindows);
          } catch (error) {
            db.saveSettings({ startWithWindows: previousStartup });
            throw error;
          }
        }
        value = { ...saved, startWithWindows: startup.status(saved.startWithWindows) };
        writingBubble?.setAlwaysOnTop(saved.bubblePinned || saved.alwaysOnTop);
        companion?.configure();
        break;
      }
      case 'calendarStatus':
        value = calendar?.status;
        break;
      case 'calendarConfigure': {
        if (!calendar) throw new Error('Calendar is not ready.');
        const result = await dialog.showOpenDialog(sender, {
          title: 'Choose Google Desktop app credentials',
          filters: [{ name: 'Google client JSON', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (!result.canceled && result.filePaths[0]) {
          if (statSync(result.filePaths[0]).size > 65536)
            throw new Error('Choose a Google Desktop client JSON file smaller than64KB.');
          let parsed: unknown;
          try {
            parsed = JSON.parse(readFileSync(result.filePaths[0], 'utf8'));
          } catch {
            throw new Error('That file is not valid Google client JSON.');
          }
          calendar.configure(parsed);
        }
        value = calendar.status;
        break;
      }
      case 'calendarConnect':
        await calendar?.connect();
        value = calendar?.status;
        break;
      case 'calendarDisconnect':
        await calendar?.disconnect();
        value = calendar?.status;
        break;
      case 'calendarCancelConnect':
        calendar?.cancelConnect();
        value = true;
        break;
      case 'calendarSync':
        await calendar?.sync();
        value = calendar?.status;
        break;
      case 'showBubble':
        await showBubble(
          data.action === 'calendar'
            ? 'calendar'
            : data.action === 'reminder'
              ? 'reminder'
              : 'notes',
        );
        value = true;
        break;
      case 'hideBubble':
        writingBubble?.hide();
        value = true;
        break;
      case 'hideFoxSettings':
        foxSettings?.hide();
        value = true;
        break;
      case 'bubbleLayout':
        value = bubbleLayout;
        break;
      case 'getNotebookLaunch':
        value = notebookLaunch;
        break;
      case 'showNotepad':
        await showNotepad(
          data.action === 'library'
            ? 'library'
            : data.action === 'calendar'
              ? 'calendar'
              : data.action === 'reminder'
                ? 'reminder'
                : 'notes',
          typeof data.noteId === 'string' ? data.noteId : undefined,
          typeof data.reminderId === 'string' ? data.reminderId : undefined,
        );
        value = true;
        break;
      case 'showFoxSettings':
        await showFoxSettings();
        value = true;
        break;
      case 'showWorkspace':
        showWorkspace();
        value = true;
        break;
      case 'showPet':
        companion?.show();
        value = true;
        break;
      case 'hidePet':
        companion?.hide();
        value = true;
        break;
      case 'togglePet':
        companion?.toggle();
        value = true;
        break;
      case 'petState':
        value = companion?.view;
        break;
      case 'petAction':
        companion?.act(data.action);
        value = true;
        break;
      case 'petRegions':
      case 'petSystemMotion':
      case 'petDrag': {
        if (sender !== companion?.window) throw new Error('This action is only available to Pip.');
        if (action === 'petRegions') companion.setRegions(data.regions);
        else if (action === 'petSystemMotion') companion.setSystemReduced(data.reduced);
        else if (typeof data.dragging !== 'boolean') throw new Error('Invalid drag state.');
        else if (data.dragging) companion.startDrag();
        else companion.endDrag();
        value = true;
        break;
      }
      case 'seedDemo': {
        const existing = db.snapshot().projects.find((p) => p.name === 'Aster Devices');
        if (existing) {
          value = existing;
          break;
        }
        const p = db.createProject({ name: 'Aster Devices', ticker: 'DEMO' });
        db.saveNote({
          projectId: p.id,
          title: 'Quarterly update · sample',
          body: 'This is fictional sample research, created to show you around.\n\nAster Devices reported revenue of $40 million, up 12% from the previous quarter. Strong demand for home sensors helped sales.\n\nManagement expects demand to stay healthy through the holiday season. The main risk is a shortage of components that could delay shipments.\n\nNext step: compare the demand outlook with the latest supplier update.',
          publishedOn: '2026-10-15',
        });
        db.saveNote({
          projectId: p.id,
          title: 'Supplier update · sample',
          body: 'This is fictional sample research.\n\nAster’s main supplier expects component deliveries to improve in December. However, two smaller suppliers reported longer lead times.\n\nThe outlook for demand remains positive, but production capacity is uncertain. Review the next quarterly report before changing your thesis.',
          publishedOn: '2026-10-28',
        });
        value = p;
        break;
      }
      default:
        throw new Error('That action is not available.');
    }
    if (['saveReminder', 'completeReminder', 'snoozeReminder'].includes(action))
      void calendar?.sync();
    if (
      ![
        'snapshot',
        'focusStatus',
        'revision',
        'calendarPreview',
        'calendarStatus',
        'bubbleLayout',
        'getNotebookLaunch',
        'importFile',
        'petState',
        'petRegions',
        'petDrag',
        'petSystemMotion',
        'petAction',
      ].includes(action)
    )
      changed();
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
    };
  }
});
