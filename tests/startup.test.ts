import { describe, expect, it, vi } from 'vitest';
import type { LaunchItems } from 'electron';
import {
  STARTUP_ARGS,
  STARTUP_NAME,
  WindowsStartup,
  type LoginItemAdapter,
} from '../src/main/startup.js';

const executable =
  'C:\\Users\\Sample\\AppData\\Local\\Programs\\Research Buddy\\Research Buddy.exe';
const launchItem = (patch: Partial<LaunchItems> = {}): LaunchItems => ({
  name: STARTUP_NAME,
  path: executable,
  args: [...STARTUP_ARGS],
  enabled: true,
  scope: 'user',
  ...patch,
});
function fixture(options: Partial<ConstructorParameters<typeof WindowsStartup>[1]> = {}) {
  let items: LaunchItems[] = [];
  const adapter: LoginItemAdapter = {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: items.length > 0, launchItems: items })),
    setLoginItemSettings: vi.fn((value) => {
      items = value.openAtLogin ? [launchItem({ enabled: value.enabled })] : [];
    }),
  };
  const startup = new WindowsStartup(adapter, {
    executable,
    platform: 'win32',
    installed: true,
    testMode: false,
    ...options,
  });
  return {
    startup,
    adapter,
    setItems(next: LaunchItems[]) {
      items = next;
    },
  };
}

describe('Windows startup preference', () => {
  it('reads the exact current executable and startup arguments without registering anything', () => {
    const { startup, adapter, setItems } = fixture();
    expect(startup.status(true)).toBe(false);
    setItems([launchItem()]);
    expect(startup.status(false)).toBe(true);
    expect(adapter.getLoginItemSettings).toHaveBeenLastCalledWith({
      path: executable,
      args: [],
    });
    expect(adapter.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('explicitly enables and removes the same named login item', () => {
    const { startup, adapter } = fixture();
    expect(startup.set(true)).toBe(true);
    expect(adapter.setLoginItemSettings).toHaveBeenLastCalledWith({
      name: 'Research Buddy',
      path: executable,
      args: [],
      openAtLogin: true,
      enabled: true,
    });
    expect(startup.set(false)).toBe(false);
    expect(adapter.setLoginItemSettings).toHaveBeenLastCalledWith({
      name: 'Research Buddy',
      path: executable,
      args: [],
      openAtLogin: false,
      enabled: false,
    });
  });

  it.each([
    { enabled: false },
    { name: 'Unrelated app' },
    { path: 'C:\\Other\\Research Buddy.exe' },
    { args: ['--startup'] },
    { args: ['--startup', '--other'] },
    { scope: 'machine' as const },
  ])('does not report unrelated or Windows-disabled items as enabled: %j', (patch) => {
    const { startup, setItems } = fixture();
    setItems([launchItem(patch)]);
    expect(startup.status()).toBe(false);
  });

  it('matches Windows path casing while respecting startup arguments', () => {
    const { startup, setItems } = fixture();
    setItems([launchItem({ path: executable.toUpperCase() })]);
    expect(startup.status()).toBe(true);
  });

  it('registers without switches so Electron can report the installed login item accurately', () => {
    const { startup, adapter } = fixture();
    vi.mocked(adapter.getLoginItemSettings).mockImplementation((options) => ({
      // Mirrors the actual Windows parser: switches are absent from GetArgs().
      openAtLogin: options.args?.length === 0,
      launchItems: [launchItem({ args: [] })],
    }));
    expect(startup.set(true)).toBe(true);
    expect(adapter.setLoginItemSettings).toHaveBeenLastCalledWith({
      name: STARTUP_NAME,
      path: executable,
      args: [],
      openAtLogin: true,
      enabled: true,
    });
  });

  it('keeps development/unpacked launches from registering a temporary executable', () => {
    const { startup, adapter } = fixture({ installed: false });
    expect(() => startup.set(true)).toThrow('Install Research Buddy');
    expect(adapter.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('uses the persisted fake preference in BUDDY_TEST without any OS reads or writes', () => {
    const { startup, adapter } = fixture({ testMode: true, installed: false });
    expect(startup.status(true)).toBe(true);
    expect(startup.status(false)).toBe(false);
    expect(startup.set(true)).toBe(true);
    expect(startup.set(false)).toBe(false);
    expect(adapter.getLoginItemSettings).not.toHaveBeenCalled();
    expect(adapter.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('does not touch login items on other platforms', () => {
    const { startup, adapter } = fixture({ platform: 'linux' });
    expect(startup.status(true)).toBe(false);
    expect(startup.set(false)).toBe(false);
    expect(() => startup.set(true)).toThrow('available on Windows');
    expect(adapter.getLoginItemSettings).not.toHaveBeenCalled();
    expect(adapter.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it.each(['true', 1, null, undefined, {}])(
    'rejects invalid values before touching Windows: %j',
    (value) => {
      const { startup, adapter } = fixture();
      expect(() => startup.set(value)).toThrow('Choose whether');
      expect(adapter.setLoginItemSettings).not.toHaveBeenCalled();
    },
  );

  it('reports an OS refusal instead of claiming startup was saved', () => {
    const { startup, adapter } = fixture();
    vi.mocked(adapter.setLoginItemSettings).mockImplementation(() => {});
    expect(() => startup.set(true)).toThrow('Windows could not change startup');
  });
});

it('reads the enabled named entry even when Electron aggregate openAtLogin checks its default name', () => {
  const { startup, adapter, setItems } = fixture();
  setItems([launchItem()]);
  vi.mocked(adapter.getLoginItemSettings).mockReturnValue({
    openAtLogin: false,
    launchItems: [launchItem()],
  });
  expect(startup.status()).toBe(true);
});
