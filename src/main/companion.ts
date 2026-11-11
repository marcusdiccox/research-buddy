import { BrowserWindow, globalShortcut, screen } from 'electron';
import {
  PetBehavior,
  bindPetShortcut,
  clampPetPosition,
  petWindowSize,
  pointHitsRegions,
} from '../core/pet.js';
import type { BuddyStore } from '../core/store.js';
import type { HitRegion, NotebookAction, PetView } from '../shared/contracts.js';

interface Options {
  store: BuddyStore;
  createWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow;
  loadWindow: (window: BrowserWindow, hash: string) => Promise<void>;
  openNotebook: (action: NotebookAction) => void;
  onChange: () => void;
  autoShow: boolean;
}
export class CompanionController {
  window: BrowserWindow | undefined;
  private behavior: PetBehavior;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick = Date.now();
  private lastView = '';
  private visible: boolean;
  private disposed = false;
  private reminderUntil = 0;
  private reminderQueue: {
    key: string;
    message: () => string | null;
    shown: (() => void)[];
    failed: (() => void)[];
  }[] = [];
  get canRemind() {
    return this.visible && !!this.window && !this.window.isDestroyed() && this.window.isVisible();
  }
  remind(
    key: string,
    message: () => string | null,
    shown: () => void,
    failed: () => void,
  ): boolean {
    if (!this.canRemind) return false;
    const existing = this.reminderQueue.find((item) => item.key === key);
    if (existing) {
      existing.shown.push(shown);
      existing.failed.push(failed);
    } else this.reminderQueue.push({ key, message, shown: [shown], failed: [failed] });
    return true;
  }
  private menuOpen = false;
  private engaged = false;
  private focusActive = false;
  private systemReduced = false;
  private regions: HitRegion[] = [{ x: 80, y: 172, width: 80, height: 80, shape: 'ellipse' }];
  private ignoring = true;
  private drag: { cursor: { x: number; y: number }; origin: { x: number; y: number } } | null =
    null;
  private binding: { requested: string; active: string | null; available: boolean } = {
    requested: '',
    active: null,
    available: false,
  };
  constructor(private options: Options) {
    const settings = options.store.settings(),
      area = screen.getPrimaryDisplay().workArea;
    const position = clampPetPosition(
      {
        x: settings.petX ?? area.x + area.width - 260,
        y: settings.petY ?? area.y + area.height - petWindowSize.height - 12,
      },
      petWindowSize,
      screen.getAllDisplays().map((d) => d.workArea),
    );
    this.behavior = new PetBehavior(settings, position, Date.now());
    this.visible = settings.petVisible;
    this.bindShortcut();
    if (this.visible && options.autoShow && true) this.behavior.wake(Date.now());
    if (this.visible) this.create();
  }
  private bindShortcut() {
    this.binding = bindPetShortcut(
      globalShortcut,
      this.options.store.settings().petShortcut,
      this.binding.active,
      () => this.toggle(),
    );
  }
  get status() {
    return { shortcutAvailable: this.binding.available, activeShortcut: this.binding.active };
  }
  private applyStacking() {
    if (!this.window || this.window.isDestroyed()) return;
    const pinned = this.options.store.settings().alwaysOnTop;
    // Windows can leave the default floating level underneath other app windows.
    this.window.setAlwaysOnTop(pinned, pinned ? 'pop-up-menu' : 'normal');
  }
  get view(): PetView {
    const frame = this.behavior.snapshot();
    return {
      pose: frame.pose,
      direction: frame.direction,
      phrase: frame.phrase,
      preferences: {
        ...this.behavior.preferences,
        petReducedMotion: this.behavior.preferences.petReducedMotion || this.systemReduced,
      },
      ...this.status,
      menuOpen: this.menuOpen,
    };
  }
  private publish(force = false) {
    if (!this.window || this.window.isDestroyed()) return;
    const view = this.view,
      key = JSON.stringify(view);
    if (force || key !== this.lastView) {
      this.lastView = key;
      this.window.webContents.send('pet:state', view);
    }
  }
  private create() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const position = this.behavior.snapshot();
    const window = this.options.createWindow({
      ...petWindowSize,
      x: Math.round(position.x),
      y: Math.round(position.y),
      frame: false,
      thickFrame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: this.options.store.settings().alwaysOnTop,
      show: false,
      hasShadow: false,
      webPreferences: { backgroundThrottling: false },
    });
    this.window = window;
    this.ignoring = true;
    this.regions = [{ x: 80, y: 172, width: 80, height: 80, shape: 'ellipse' }];
    window.setMenuBarVisibility(false);
    window.setIgnoreMouseEvents(true, { forward: true });
    window.on('show', () => this.start());
    window.on('hide', () => this.stop());
    window.on('close', (event) => {
      if (!this.disposed) {
        event.preventDefault();
        this.hide();
      }
    });
    window.on('blur', () => {
      if (this.menuOpen) {
        this.menuOpen = false;
        this.publish();
      }
      if (this.drag) this.endDrag();
    });
    window.on('closed', () => {
      this.stop();
      this.window = undefined;
      if (!this.disposed) {
        this.visible = false;
        this.options.store.saveSettings({ petVisible: false });
        this.options.onChange();
      }
    });
    void this.options.loadWindow(window, 'pet').then(() => {
      this.publish(true);
      if (this.visible && this.options.autoShow) window.showInactive();
      this.applyStacking();
    });
    return window;
  }
  configure() {
    const settings = this.options.store.settings();
    this.behavior.configure(settings, Date.now());
    this.bindShortcut();
    if (settings.petVisible !== this.visible) {
      if (settings.petVisible) this.show();
      else this.hide();
    }
    this.applyStacking();
    this.publish(true);
    this.options.onChange();
  }
  show(entrance = false) {
    this.visible = true;
    this.options.store.saveSettings({ petVisible: true });
    this.behavior.resume(Date.now());
    this.behavior.dismiss();
    this.menuOpen = false;
    const window = this.create();
    if (entrance && !this.focusActive) {
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      this.behavior.enter(area, window.getBounds(), Date.now(), this.systemReduced);
      const frame = this.behavior.snapshot();
      window.setBounds({ x: Math.round(frame.x), y: Math.round(frame.y), ...petWindowSize });
    }
    window.showInactive();
    this.applyStacking();
    this.publish(true);
    this.options.onChange();
  }
  hide() {
    this.savePosition();
    this.visible = false;
    this.options.store.saveSettings({ petVisible: false });
    this.menuOpen = false;
    this.behavior.dismiss();
    this.window?.hide();
    this.stop();
    this.publish(true);
    this.options.onChange();
  }
  toggle() {
    if (this.visible) this.hide();
    else this.show(true);
  }
  setEngaged(active: boolean) {
    this.engaged = active;
    this.behavior.interact(Date.now());
  }
  setFocusActive(active: boolean) {
    if (this.focusActive === active) return;
    this.focusActive = active;
    // Keep an urgent reminder already on screen while clearing casual speech.
    if (Date.now() >= this.reminderUntil) this.behavior.dismiss();
    this.behavior.resume(Date.now());
    this.publish(true);
  }
  private start() {
    if (this.timer) return;
    this.window?.webContents.setBackgroundThrottling(false);
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 50);
    this.timer.unref();
  }
  private stop() {
    const pending = this.reminderQueue.splice(0);
    for (const item of pending) for (const fail of item.failed) fail();
    this.reminderUntil = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.setBackgroundThrottling(true);
    this.drag = null;
    this.menuOpen = false;
    this.behavior.dismiss();
    this.behavior.resume(Date.now());
  }
  private savePosition() {
    if (!this.window || this.window.isDestroyed()) return;
    const { x, y } = this.window.getBounds();
    this.options.store.saveSettings({ petX: x, petY: y });
  }
  clamp() {
    if (!this.window || this.window.isDestroyed()) return;
    const position = clampPetPosition(
      this.window.getBounds(),
      this.window.getBounds(),
      screen.getAllDisplays().map((d) => d.workArea),
    );
    this.window.setBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      ...petWindowSize,
    });
    this.behavior.place(position);
    this.behavior.resume(Date.now());
    this.savePosition();
  }
  private tick() {
    const window = this.window;
    if (!window || window.isDestroyed() || !window.isVisible()) {
      this.stop();
      return;
    }
    const now = Date.now(),
      elapsed = now - this.lastTick;
    this.lastTick = now;
    const cursor = screen.getCursorScreenPoint(),
      bounds = window.getBounds();
    const hovered = pointHitsRegions(
      { x: cursor.x - bounds.x, y: cursor.y - bounds.y },
      this.regions,
    );
    const ignore = !hovered && !this.drag;
    if (ignore !== this.ignoring) {
      window.setIgnoreMouseEvents(ignore, { forward: true });
      this.ignoring = ignore;
    }
    const area = screen.getDisplayMatching(bounds).workArea;
    if (this.drag) {
      const position = clampPetPosition(
        {
          x: this.drag.origin.x + cursor.x - this.drag.cursor.x,
          y: this.drag.origin.y + cursor.y - this.drag.cursor.y,
        },
        bounds,
        screen.getAllDisplays().map((d) => d.workArea),
      );
      window.setBounds({ x: Math.round(position.x), y: Math.round(position.y), ...petWindowSize });
      this.behavior.place(position);
    }
    if (!this.menuOpen && now >= this.reminderUntil && this.reminderQueue.length) {
      const item = this.reminderQueue.shift()!;
      const message = item.message();
      if (message) {
        this.behavior.announceReminder(message, now);
        this.reminderUntil = now + 12000;
        this.publish(true);
        for (const shown of item.shown) shown();
      } else for (const failed of item.failed) failed();
    }
    const prior = this.behavior.snapshot();
    const frame = this.behavior.tick(now, elapsed, area, bounds, {
      visible: true,
      hovered,
      menuOpen: this.menuOpen || this.engaged || this.focusActive,
      dragging: !!this.drag,
      reducedMotion: this.systemReduced,
    });
    if (!this.drag && (Math.round(frame.x) !== bounds.x || Math.round(frame.y) !== bounds.y))
      window.setBounds({ x: Math.round(frame.x), y: Math.round(frame.y), ...petWindowSize });
    if (prior.pose === 'walking' && frame.pose !== 'walking') this.savePosition();
    this.publish();
  }
  setRegions(raw: unknown) {
    if (!Array.isArray(raw) || raw.length > 20) throw new Error('Invalid companion hit regions.');
    this.regions = raw.map((r) => {
      if (
        !r ||
        !['rect', 'ellipse'].includes(r.shape) ||
        ![r.x, r.y, r.width, r.height].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
        r.width < 0 ||
        r.height < 0 ||
        r.x < 0 ||
        r.y < 0 ||
        r.x + r.width > petWindowSize.width + 1 ||
        r.y + r.height > petWindowSize.height + 1
      )
        throw new Error('Invalid companion hit region.');
      return { x: r.x, y: r.y, width: r.width, height: r.height, shape: r.shape } as HitRegion;
    });
  }
  setSystemReduced(value: unknown) {
    if (typeof value !== 'boolean') throw new Error('Invalid motion preference.');
    this.systemReduced = value;
    this.behavior.resume(Date.now());
    this.publish(true);
  }
  startDrag() {
    if (!this.window) return;
    this.behavior.interact(Date.now());
    this.drag = { cursor: screen.getCursorScreenPoint(), origin: this.window.getBounds() };
    this.menuOpen = false;
    this.window.setIgnoreMouseEvents(false);
    this.ignoring = false;
    this.publish();
  }
  endDrag() {
    if (!this.drag) return;
    this.drag = null;
    if (this.window) {
      this.behavior.place(this.window.getBounds());
      this.behavior.interact(Date.now());
      this.savePosition();
    }
    this.publish();
  }
  act(action: unknown) {
    this.behavior.interact(Date.now());
    switch (action) {
      case 'menu':
        this.menuOpen = !this.menuOpen;
        break;
      case 'close-menu':
        this.menuOpen = false;
        break;
      case 'dismiss':
        this.behavior.dismiss();
        break;
      case 'joke':
        this.menuOpen = false;
        if (this.behavior.snapshot().pose === 'sleeping') this.behavior.wake(Date.now());
        this.behavior.tellJoke(Date.now());
        break;
      case 'play':
        this.menuOpen = false;
        this.behavior.play(Date.now());
        break;
      case 'notes':
      case 'reminder':
      case 'settings':
        this.menuOpen = false;
        this.options.openNotebook(action);
        break;
      case 'hide':
        this.hide();
        return;
      default:
        throw new Error('Choose an available companion action.');
    }
    this.publish(true);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.savePosition();
    this.stop();
    if (this.binding.active) globalShortcut.unregister(this.binding.active);
    this.binding.active = null;
  }
}
