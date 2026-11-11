import { useEffect, useRef, useState } from 'react';
import { Pin, PinOff, X, Square, Play, Sprout } from 'lucide-react';
import type { FocusPanelStatus } from '../shared/contracts';
import './floating.css';
import './floating-focus.css';

export function FloatingFocus() {
  const drag = useRef<number | null>(null);
  const [status, setStatus] = useState<FocusPanelStatus | null>(null);
  const [minutes, setMinutes] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const sequence = ++request.current;
      try {
        const next = await window.buddy!.call<FocusPanelStatus>('focusPanelStatus');
        if (active && sequence === request.current) {
          setStatus(next);
          if (next.active || next.completed) setMinutes(next.durationSeconds / 60);
        }
      } catch (failure) {
        if (active)
          setError(failure instanceof Error ? failure.message : 'Could not read the timer.');
      }
    };
    void refresh();
    const unsubscribe = window.buddy?.onChange(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 500);
    return () => {
      active = false;
      ++request.current;
      unsubscribe?.();
      window.clearInterval(timer);
    };
  }, []);
  async function act(action: string, data?: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    ++request.current;
    try {
      await window.buddy!.call(action, data);
      const next = await window.buddy!.call<FocusPanelStatus>('focusPanelStatus');
      ++request.current;
      setStatus(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const completed = !!status?.completed;
  const seconds = status?.active ? status.remainingSeconds : completed ? 0 : minutes * 60;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const progress = completed
    ? 1
    : status?.active
      ? Math.max(0, Math.min(1, 1 - seconds / status.durationSeconds))
      : 0;
  const circumference = Math.PI * 50;
  return (
    <main className={`focus-floating ${completed ? 'is-complete' : ''}`}>
      <section
        className="focus-card"
        aria-label="Floating focus timer"
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as Element).closest('button,select')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = event.pointerId;
          void window.buddy
            ?.call('focusDrag', { dragging: true, clientX: event.clientX, clientY: event.clientY })
            .catch((failure) => setError(String(failure)));
        }}
        onPointerUp={(event) => {
          if (drag.current !== event.pointerId) return;
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          void window.buddy?.call('focusDrag', { dragging: false });
        }}
        onPointerCancel={() => {
          drag.current = null;
          void window.buddy?.call('focusDrag', { dragging: false });
        }}
        onLostPointerCapture={() => {
          if (drag.current !== null) {
            drag.current = null;
            void window.buddy?.call('focusDrag', { dragging: false });
          }
        }}
      >
        <header className="focus-card-header">
          <h1>{completed ? 'Nice work.' : 'Focus'}</h1>
          <div className="focus-card-controls">
            <button
              className="focus-pin"
              type="button"
              disabled={busy || !status}
              aria-label={status?.pinned ? 'Unpin focus timer' : 'Pin focus timer'}
              aria-pressed={!!status?.pinned}
              title={status?.pinned ? 'Unpin from other windows' : 'Keep above other windows'}
              onClick={() => void act('settings', { focusPinned: !status?.pinned })}
            >
              {status?.pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <button
              className="focus-hide"
              type="button"
              aria-label="Hide focus timer"
              title="Hide timer · focus keeps running"
              onClick={() => void act('hideFocusTimer')}
            >
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="focus-card-display">
          <div>
            <span
              className="floating-countdown"
              role="timer"
              aria-label={`Focus time remaining ${time}`}
            >
              {time}
            </span>
            <p>{completed ? 'A little progress, made.' : 'One thing at a time.'}</p>
          </div>
          <div
            className="focus-ring"
            role="progressbar"
            aria-label="Focus session progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <svg viewBox="0 0 60 60" aria-hidden="true">
              <circle className="focus-ring-track" cx="30" cy="30" r="25" />
              <circle
                className="focus-ring-fill"
                cx="30"
                cy="30"
                r="25"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                transform="rotate(-90 30 30)"
              />
            </svg>
            <Sprout size={19} aria-hidden="true" />
          </div>
        </div>
        <footer className="focus-card-footer">
          {status?.active ? (
            <span className="focus-quiet">
              <i />
              Quiet focus
            </span>
          ) : completed ? (
            <span className="focus-quiet">
              <i />
              Session complete
            </span>
          ) : (
            <select
              aria-label="Floating focus duration"
              value={minutes}
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
            className="focus-session-action"
            type="button"
            disabled={busy || !status}
            aria-label={status?.active ? 'Stop focus' : completed ? 'Start again' : 'Start focus'}
            onClick={() =>
              void act(
                status?.active ? 'focusStop' : 'focusStart',
                status?.active ? undefined : { minutes },
              )
            }
          >
            {status?.active ? <Square size={9} /> : <Play size={10} />}{' '}
            {status?.active ? 'Stop' : completed ? 'Start again' : 'Start'}
          </button>
        </footer>
        {error && (
          <p className="focus-card-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
