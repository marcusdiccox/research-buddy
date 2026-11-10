import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Bell, Settings, X, Heart } from 'lucide-react';
import { animalNames } from '../core/animals';
import { Fox } from './Fox';
import type { HitRegion, PetView } from '../shared/contracts';
import './pet.css';

export function PetWindow() {
  const [view, setView] = useState<PetView | null>(null),
    [error, setError] = useState('');
  const root = useRef<HTMLElement>(null),
    button = useRef<HTMLButtonElement>(null),
    drag = useRef<{ x: number; y: number; pointer: number } | null>(null),
    menu = useRef<HTMLDivElement>(null);
  const call = async (action: string, data?: unknown) => {
    try {
      return await window.buddy?.call(action, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    }
  };
  useEffect(() => {
    let mounted = true;
    void window.buddy?.call<PetView>('petState').then((state) => {
      if (mounted) setView(state);
    });
    const unsub = window.buddy?.onPetState(setView);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => {
      void window.buddy?.call('petSystemMotion', { reduced: media.matches });
    };
    motion();
    media.addEventListener('change', motion);
    return () => {
      mounted = false;
      unsub?.();
      media.removeEventListener('change', motion);
    };
  }, []);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const report = () => {
      const regions: HitRegion[] = [...element.querySelectorAll<HTMLElement>('[data-pet-hit]')]
        .filter((e) => getComputedStyle(e).display !== 'none')
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            x: Math.max(0, r.x),
            y: Math.max(0, r.y),
            width: Math.min(r.width, 240 - Math.max(0, r.x)),
            height: Math.min(r.height, 260 - Math.max(0, r.y)),
            shape: e.dataset.petHit === 'ellipse' ? 'ellipse' : 'rect',
          };
        });
      void window.buddy?.call('petRegions', { regions }).catch(() => {});
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    element.querySelectorAll('[data-pet-hit]').forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, [view?.menuOpen, view?.phrase, error]);
  useEffect(() => {
    if (view?.menuOpen) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [view?.menuOpen]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void call('petAction', { action: 'close-menu' });
        button.current?.focus();
      }
      if (view?.menuOpen && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) {
        event.preventDefault();
        const items = [...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')],
          index = items.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index +
                  (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1) +
                  items.length) %
                items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [view?.menuOpen]);
  const act = (action: string) => {
    setError('');
    void call('petAction', { action });
  };
  return (
    <main
      ref={root}
      className={`desktop-fox ${view?.preferences.petReducedMotion ? 'motion-reduced' : ''}`}
      aria-label="Pip desktop companion"
    >
      {view?.phrase && !view.menuOpen && (
        <div className="fox-bubble" data-pet-hit="rect">
          <p role="status">{view.phrase}</p>
          <button aria-label="Dismiss Pip’s message" onClick={() => act('dismiss')}>
            <X size={11} />
          </button>
          <span className="fox-bubble-tip" />
        </div>
      )}
      {error && (
        <div className="fox-bubble" data-pet-hit="rect" role="alert">
          <p>{error}</p>
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={11} />
          </button>
        </div>
      )}
      <button
        ref={button}
        className="fox-pet-button"
        data-pet-hit="ellipse"
        aria-label={`Pip the ${animalNames[view?.preferences.petSpecies ?? 'fox']} — open notepad`}
        aria-haspopup="menu"
        aria-expanded={!!view?.menuOpen}
        title={`Click for notes · right-click for tools · drag to move · ${view?.activeShortcut ? view.activeShortcut.replace('Control', 'Ctrl').replaceAll('+', ' + ') + ' to hide' : 'use the tray to hide or restore Pip'}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.screenX, y: e.screenY, pointer: e.pointerId };
          void call('petDrag', { dragging: true });
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          if (!start || start.pointer !== e.pointerId) return;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          void call('petDrag', { dragging: false }).then(() => {
            if (Math.hypot(e.screenX - start.x, e.screenY - start.y) < 6) act('notes');
          });
        }}
        onPointerCancel={() => {
          drag.current = null;
          void call('petDrag', { dragging: false });
        }}
        onClick={(e) => {
          if (e.detail === 0) act('notes');
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          act('menu');
        }}
      >
        <Fox
          species={view?.preferences.petSpecies}
          appearance={view?.preferences.petAppearance}
          pose={view?.pose}
          direction={view?.direction}
        />
      </button>
      {view?.menuOpen && (
        <div
          ref={menu}
          className="fox-menu"
          role="menu"
          aria-label="Pip’s helpers"
          data-pet-hit="rect"
        >
          <div className="fox-menu-title">
            A little friend, a little help.
            <button aria-label="Close Pip menu" onClick={() => act('close-menu')}>
              <X size={13} />
            </button>
          </div>
          <button role="menuitem" onClick={() => act('notes')}>
            <BookOpen size={15} />
            Open my notebook
          </button>
          <button role="menuitem" onClick={() => act('reminder')}>
            <Bell size={15} />
            New reminder
          </button>
          <button role="menuitem" onClick={() => act('settings')}>
            <Settings size={15} />
            Companion settings
          </button>
          <button role="menuitem" onClick={() => act('play')}>
            <Heart size={15} />
            {view?.preferences.petSpecies === 'otter'
              ? 'Float a little'
              : view?.preferences.petSpecies === 'red-panda'
                ? 'Tail hug'
                : 'Say hello'}
          </button>
          <button role="menuitem" onClick={() => act('hide')}>
            <X size={15} />
            Hide Pip{' '}
            <kbd>
              {view.activeShortcut?.replace('Control', 'Ctrl').replaceAll('+', ' + ') ||
                'Use tray to restore'}
            </kbd>
          </button>
        </div>
      )}
    </main>
  );
}
