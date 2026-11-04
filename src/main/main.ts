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
} from 'electron';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { BuddyStore, text } from '../core/store.js';
import { summarize, answerFromNotes } from '../core/research.js';
import { googleCalendarUrl, calendarFile } from '../core/calendar.js';
import { exportDossier } from '../core/export.js';
import { deliverDueReminders } from '../core/notifications.js';
import { CompanionController } from './companion.js';
import type { NoteDraft, JournalDraft, ReminderDraft, Settings } from '../shared/contracts.js';

const here = dirname(fileURLToPath(import.meta.url));
const testMode = process.env.BUDDY_TEST === '1';
if (process.env.RESEARCH_BUDDY_DATA_DIR)
  app.setPath('userData', resolve(process.env.RESEARCH_BUDDY_DATA_DIR));
app.setName('Research Buddy');
app.setAppUserModelId('com.researchbuddy.desktop');
let workspace: BrowserWindow | undefined,
  companion: CompanionController | undefined,
  tray: Tray | undefined,
  db: BuddyStore,
  quitting = false;
const notices = new Set<Notification>();
const iconPath = join(here, '../../assets/pip.png');
function changed() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('buddy:changed');
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
  return win;
}
function load(win: BrowserWindow, hash = '') {
  return win.loadFile(join(here, '../../dist/index.html'), { hash });
}
function notifyDue() {
  if (!db || !db.settings().notifications || !Notification.isSupported() || testMode) return;
  deliverDueReminders(
    db,
    (r) => {
      const notification = new Notification({
        title: r.title,
        body:
          r.details ||
          'A gentle nudge from Research Buddy. Open Reminders to snooze or mark it done.',
        silent: false,
      });
      notices.add(notification);
      notification.on('click', showWorkspace);
      notification.on('close', () => notices.delete(notification));
      notification.on('failed', () => notices.delete(notification));
      return notification;
    },
    new Date(),
    changed,
  );
}
if (!testMode && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWorkspace);
  app
    .whenReady()
    .then(async () => {
      mkdirSync(app.getPath('userData'), { recursive: true });
      db = new BuddyStore(join(app.getPath('userData'), 'research.sqlite'));
      if (!db.snapshot().projects.length) db.createProject({ name: 'My notebook' });
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
      companion = new CompanionController({
        store: db,
        createWindow: baseWindow,
        loadWindow: load,
        openNotebook: (action) => {
          showWorkspace();
          workspace?.webContents.send('buddy:navigate', action);
        },
        onChange: changed,
        autoShow: !testMode,
      });
      tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 }));
      tray.setToolTip('Research Buddy');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open Research Buddy', click: showWorkspace },
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
      tray.on('double-click', showWorkspace);
      screen.on('display-removed', () => companion?.clamp());
      screen.on('display-metrics-changed', () => companion?.clamp());
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
  companion?.dispose();
});
app.on('will-quit', () => {
  companion?.dispose();
  db?.close();
});
app.on('activate', showWorkspace);

ipcMain.handle('buddy', async (event, action: unknown, raw: unknown) => {
  const sender = BrowserWindow.fromWebContents(event.sender);
  if (
    !sender ||
    ![workspace, companion?.window].includes(sender) ||
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
      case 'snapshot':
        value = { ...db.snapshot(), companion: companion?.status };
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
        value = db.saveSettings(data as Partial<Settings>);
        companion?.configure();
        break;
      }
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
    if (
      ![
        'snapshot',
        'revision',
        'calendarPreview',
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
