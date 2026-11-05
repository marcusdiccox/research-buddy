import { useEffect, useId, useRef, useState } from 'react';
import type { FocusStatus } from '../shared/contracts';
import './focus.css';

const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not update focus. Please try again.';

export function FocusTimer({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<FocusStatus | null>(null);
  const [minutes, setMinutes] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const description = useId();

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const current = ++request.current;
      try {
        if (!window.buddy) throw new Error('Open Pip from the desktop app to use focus.');
        const next = await window.buddy.call<FocusStatus>('focusStatus');
        if (mounted && current === request.current) setStatus(next);
      } catch (failure) {
        if (mounted && current === request.current) setError(message(failure));
      }
    };
    void refresh();
    const unsubscribe = window.buddy?.onChange(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      mounted = false;
      unsubscribe?.();
      window.clearInterval(timer);
    };
  }, []);

  async function toggle() {
    if (!window.buddy || busy || !status) return;
    setBusy(true);
    setError('');
    ++request.current;
    try {
      const next = await window.buddy.call<FocusStatus>(
        status.active ? 'focusStop' : 'focusStart',
        status.active ? undefined : { minutes },
      );
      ++request.current;
      setStatus(next);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  const seconds = status?.remainingSeconds ?? 0;
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className={`focus-timer ${className}`} role="group" aria-label="Focus timer">
      <span
        className="focus-label"
        title="Quiet pauses wandering and casual speech. Reminders still arrive. Quitting ends the session."
      >
        Focus
      </span>
      {status?.active ? (
        <span
          className="focus-countdown"
          role="timer"
          aria-label={`Focus time remaining ${countdown}`}
        >
          {countdown}
        </span>
      ) : (
        <select
          aria-label="Focus duration"
          value={minutes}
          disabled={busy}
          onChange={(event) => setMinutes(Number(event.target.value))}
        >
          {[15, 25, 45].map((value) => (
            <option key={value} value={value}>
              {value} min
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={busy || !status}
        onClick={() => void toggle()}
        aria-describedby={description}
      >
        {status?.active ? 'Stop focus' : 'Start focus'}
      </button>
      <span id={description} className="focus-hint">
        Quiet pauses casual speech and wandering while keeping reminders. Quitting ends the session.
      </span>
      {error && (
        <span className="focus-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
