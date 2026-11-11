import type { BrowserWindow } from 'electron';
import { focusWindowSize, placeFocusWindow } from '../core/focus-placement.js';

export class FocusWindow {
  window: BrowserWindow | undefined;
  private ready: Promise<void> | undefined;
  private request = 0;
  private dragTimer: ReturnType<typeof setInterval> | undefined;
  private moveDrag: (() => void) | undefined;
  constructor(
    private options: {
      createWindow: (options: Electron.BrowserWindowConstructorOptions) => BrowserWindow;
      load: (window: BrowserWindow, hash: string) => Promise<void>;
      workArea: () => { x: number; y: number; width: number; height: number };
      pinned: () => boolean;
      quitting: () => boolean;
      cursor: () => { x: number; y: number };
    },
  ) {}
  async show(activate = false) {
    const request = ++this.request;
    if (!this.window || this.window.isDestroyed()) {
      const window = this.options.createWindow({
        ...focusWindowSize,
        ...placeFocusWindow(this.options.workArea()),
        title: 'Focus · Pip',
        frame: false,
        thickFrame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        maximizable: false,
        minimizable: false,
        skipTaskbar: true,
        alwaysOnTop: this.options.pinned(),
        show: false,
      });
      this.window = window;
      window.setMenuBarVisibility(false);
      window.on('close', (event) => {
        if (!this.options.quitting()) {
          event.preventDefault();
          this.hide();
        }
      });
      window.on('closed', () => {
        this.endDrag();
        if (this.window === window) {
          this.window = undefined;
          this.ready = undefined;
        }
      });
      this.ready = this.options.load(window, 'focus');
    }
    const window = this.window;
    try {
      await this.ready;
    } catch (error) {
      if (!window.isDestroyed()) window.destroy();
      throw error;
    }
    if (request !== this.request || window.isDestroyed()) return;
    window.webContents.setBackgroundThrottling(false);
    if (activate) {
      window.show();
      window.focus();
    } else window.showInactive();
    this.clamp();
  }
  hide() {
    this.endDrag();
    ++this.request;
    this.window?.hide();
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.setBackgroundThrottling(true);
  }
  setPinned(pinned: boolean) {
    this.clamp();
    this.window?.setAlwaysOnTop(pinned, pinned ? 'pop-up-menu' : 'normal');
  }
  startDrag(clientX: number, clientY: number) {
    this.endDrag();
    const window = this.window;
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    const origin = window.getBounds();
    if (
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY) ||
      clientX < 0 ||
      clientY < 0 ||
      clientX > origin.width ||
      clientY > origin.height
    )
      throw new Error('Start dragging inside the timer.');
    const start = { x: origin.x + clientX, y: origin.y + clientY };
    let last = { x: origin.x, y: origin.y };
    this.moveDrag = () => {
      if (window.isDestroyed() || !window.isVisible()) {
        this.endDrag();
        return;
      }
      const cursor = this.options.cursor();
      const position = {
        x: Math.round(origin.x + cursor.x - start.x),
        y: Math.round(origin.y + cursor.y - start.y),
      };
      if (position.x === last.x && position.y === last.y) return;
      window.setBounds({ ...position, ...focusWindowSize });
      const pinned = this.options.pinned();
      window.setAlwaysOnTop(pinned, pinned ? 'pop-up-menu' : 'normal');
      last = position;
    };
    this.dragTimer = setInterval(this.moveDrag, 25);
    this.dragTimer.unref();
  }
  endDrag(commit = false) {
    if (this.dragTimer) clearInterval(this.dragTimer);
    this.dragTimer = undefined;
    const finalMove = this.moveDrag;
    this.moveDrag = undefined;
    if (commit) finalMove?.();
  }
  clamp() {
    if (!this.window || this.window.isDestroyed()) return;
    const position = placeFocusWindow(this.options.workArea(), this.window.getBounds());
    // Reassert size too: Windows fractional-DPI rounding can grow setPosition()
    // windows by a pixel on each hide/show cycle.
    this.window.setBounds({ ...position, ...focusWindowSize });
    const pinned = this.options.pinned();
    // On Windows the default floating level can remain below other app overlays.
    this.window.setAlwaysOnTop(pinned, pinned ? 'pop-up-menu' : 'normal');
  }
}
