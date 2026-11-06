import { win32 } from 'node:path';
import type { LoginItemSettings, LoginItemSettingsOptions, Settings } from 'electron';

/** Keep this name and argument-free command in sync with build/installer.nsh. */
export const STARTUP_NAME = 'Research Buddy';
// Cold launch already opens just Pip. Electron's Windows command-line parser
// excludes switches from GetArgs(), so a switch would make openAtLogin false.
export const STARTUP_ARGS: string[] = [];

export interface LoginItemAdapter {
  getLoginItemSettings(
    options: LoginItemSettingsOptions,
  ): Pick<LoginItemSettings, 'openAtLogin' | 'launchItems'>;
  setLoginItemSettings(settings: Settings): void;
}

export class WindowsStartup {
  constructor(
    private adapter: LoginItemAdapter,
    private options: {
      executable: string;
      platform: string;
      installed: boolean;
      testMode: boolean;
    },
  ) {}

  /** Reading a snapshot never creates or repairs a login item. */
  status(savedTestValue = false): boolean {
    if (this.options.testMode) return savedTestValue;
    if (this.options.platform !== 'win32') return false;
    const { executable } = this.options;
    const state = this.adapter.getLoginItemSettings({ path: executable, args: [...STARTUP_ARGS] });
    return (
      // Electron's aggregate flag can disagree with an explicitly named entry.
      // The exact user-scoped record also exposes Windows StartupApproved state.
      state.launchItems.some(
        (item) =>
          item.name === STARTUP_NAME &&
          item.scope === 'user' &&
          item.enabled &&
          win32.normalize(item.path).toLowerCase() === win32.normalize(executable).toLowerCase() &&
          item.args.length === STARTUP_ARGS.length &&
          item.args.every((value, index) => value === STARTUP_ARGS[index]),
      )
    );
  }

  /** Called only after an explicit change to the Start with Windows checkbox. */
  set(enabled: unknown): boolean {
    if (typeof enabled !== 'boolean') throw new Error('Choose whether Pip starts with Windows.');
    if (this.options.testMode) return enabled;
    if (this.options.platform !== 'win32') {
      if (enabled) throw new Error('Start with Windows is available on Windows.');
      return false;
    }
    if (enabled && !this.options.installed)
      throw new Error(
        'Install Research Buddy using its setup file before enabling Start with Windows.',
      );
    this.adapter.setLoginItemSettings({
      name: STARTUP_NAME,
      path: this.options.executable,
      args: [...STARTUP_ARGS],
      openAtLogin: enabled,
      enabled,
    });
    const actual = this.status();
    if (actual !== enabled)
      throw new Error(
        'Windows could not change startup. Please try again in Windows Startup Apps.',
      );
    return actual;
  }
}
