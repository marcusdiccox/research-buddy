import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Settings, Snapshot } from '../shared/contracts';
import { FoxSettings } from './FoxSettings';
import './compact.css';

export function CompactSettings() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const busyRef = useRef(false);
  const refresh = useCallback(async () => {
    if (!window.buddy) throw new Error('Open fox settings from the desktop app.');
    setData(await window.buddy.call<Snapshot>('snapshot'));
  }, []);
  const showError = (error: unknown) =>
    setMessage({
      text: error instanceof Error ? error.message : 'Could not save settings. Please try again.',
      error: true,
    });
  useEffect(() => {
    void refresh().catch(showError);
    return window.buddy?.onChange(() => void refresh().catch(showError));
  }, [refresh]);
  async function change(patch: Partial<Settings>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await window.buddy!.call('settings', patch);
      await refresh();
      setMessage({ text: 'Settings saved.' });
    } catch (error) {
      showError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="compact-shell compact-settings-shell">
      <header className="compact-header">
        <div>
          <span className="compact-eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>Fox settings</h1>
        </div>
      </header>
      {message && (
        <p
          className={`compact-message ${message.error ? 'is-error' : ''}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      {data ? (
        <FoxSettings
          settings={data.settings}
          runtime={data.companion}
          busy={busy}
          onChange={(patch) => void change(patch)}
        />
      ) : (
        <p>Opening fox settings…</p>
      )}
      <footer className="compact-footer">
        <button
          className="compact-text-button"
          onClick={() => void window.buddy?.call('showNotepad').catch(showError)}
        >
          <ArrowLeft size={14} />
          Back to notebook
        </button>
      </footer>
    </main>
  );
}
export default CompactSettings;
