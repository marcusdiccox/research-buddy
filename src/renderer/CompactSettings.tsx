import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Settings, Snapshot } from '../shared/contracts';
import './floating.css';

export function CompactSettings() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const busyRef = useRef(false);
  const showError = (error: unknown) =>
    setMessage({
      text: error instanceof Error ? error.message : 'Could not save settings.',
      error: true,
    });
  const refresh = useCallback(async () => {
    if (!window.buddy) throw new Error('Open settings from Pip.');
    setData(await window.buddy.call<Snapshot>('snapshot'));
  }, []);
  useEffect(() => {
    void refresh().catch(showError);
    return window.buddy?.onChange(() => void refresh().catch(showError));
  }, [refresh]);
  async function change(patch: Partial<Settings>) {
    if (busyRef.current || !data) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await window.buddy!.call('settings', patch);
      await refresh();
      setMessage({ text: 'Saved' });
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const settings = data?.settings;
  return (
    <main className="floating-settings">
      <section className="floating-card settings-popup" aria-label="Fox settings">
        <header className="floating-header">
          <h1>Settings</h1>
          <button
            type="button"
            className="floating-icon"
            aria-label="Close settings"
            title="Close"
            onClick={() => void window.buddy?.call('hideFoxSettings').catch(showError)}
          >
            <X size={16} />
          </button>
        </header>
        {settings ? (
          <fieldset className="popup-settings-fields" disabled={busy}>
            <label className="popup-setting">
              <span>Appearance</span>
              <select
                value={settings.petAppearance}
                onChange={(event) =>
                  void change({ petAppearance: event.target.value as Settings['petAppearance'] })
                }
              >
                <option value="red">Red</option>
                <option value="arctic">Arctic</option>
                <option value="midnight">Midnight</option>
              </select>
            </label>
            <label className="popup-setting">
              <span>Roaming</span>
              <select
                value={settings.petRoamArea}
                onChange={(event) =>
                  void change({ petRoamArea: event.target.value as Settings['petRoamArea'] })
                }
              >
                <option value="bottom">Bottom edge</option>
                <option value="desktop">Desktop</option>
                <option value="parked">Parked</option>
              </select>
            </label>
            <label className="popup-setting">
              <span>Jokes</span>
              <select
                value={settings.petJokeStyle}
                onChange={(event) =>
                  void change({ petJokeStyle: event.target.value as Settings['petJokeStyle'] })
                }
              >
                <option value="wholesome">Wholesome</option>
                <option value="dad">Dad jokes</option>
                <option value="nerdy">Nerdy</option>
              </select>
            </label>
            <label className="popup-setting">
              <span>Shortcut</span>
              <select
                value={settings.petShortcut}
                onChange={(event) =>
                  void change({ petShortcut: event.target.value as Settings['petShortcut'] })
                }
              >
                <option value="Control+Alt+P">Ctrl + Alt + P</option>
                <option value="Control+Shift+Space">Ctrl + Shift + Space</option>
                <option value="Alt+Shift+P">Alt + Shift + P</option>
              </select>
            </label>
            <label className="popup-setting popup-toggle">
              <span>Show Pip</span>
              <input
                type="checkbox"
                checked={settings.petVisible}
                onChange={(event) => void change({ petVisible: event.target.checked })}
              />
            </label>
            <label className="popup-setting popup-toggle">
              <span>Always on top</span>
              <input
                type="checkbox"
                checked={settings.alwaysOnTop}
                onChange={(event) => void change({ alwaysOnTop: event.target.checked })}
              />
            </label>
            <label className="popup-setting popup-toggle">
              <span>Reduced motion</span>
              <input
                type="checkbox"
                checked={settings.petReducedMotion}
                onChange={(event) => void change({ petReducedMotion: event.target.checked })}
              />
            </label>
          </fieldset>
        ) : (
          <p className="settings-loading">Opening settings…</p>
        )}
        <p
          className={`floating-status ${message?.error || data?.companion?.shortcutAvailable === false ? 'is-error' : ''}`}
          role={message?.error ? 'alert' : 'status'}
        >
          {message?.text ??
            (data?.companion?.shortcutAvailable === false
              ? 'Shortcut unavailable. Choose another.'
              : '\u00a0')}
        </p>
      </section>
    </main>
  );
}
export default CompactSettings;
