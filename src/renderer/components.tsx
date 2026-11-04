import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, Sprout } from 'lucide-react';

export function Pip({ small = false, happy = false }: { small?: boolean; happy?: boolean }) {
  return (
    <div
      className={`pip ${small ? 'pip-small' : ''} ${happy ? 'pip-happy' : ''}`}
      aria-hidden="true"
    >
      <div className="pip-leaf leaf-one" />
      <div className="pip-leaf leaf-two" />
      <div className="pip-body">
        <span className="pip-eye eye-left" />
        <span className="pip-eye eye-right" />
        <span className="pip-cheek cheek-left" />
        <span className="pip-cheek cheek-right" />
        <span className="pip-mouth" />
      </div>
      <div className="pip-foot foot-left" />
      <div className="pip-foot foot-right" />
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    id = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const first =
      ref.current?.querySelector<HTMLElement>('input, textarea, select') ??
      ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const items = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]',
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      prior?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`modal ${wide ? 'modal-wide' : ''}`}
      >
        <div className="modal-header">
          <h2 id={id}>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Sprout size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function PetWindow() {
  useEffect(() => {
    document.body.classList.add('pet-mode');
    return () => document.body.classList.remove('pet-mode');
  }, []);
  return (
    <main className="desktop-pet">
      <div className="pet-drag" title="Drag me somewhere comfy">
        <span>your little research buddy</span>
      </div>
      <button
        className="pet-open"
        aria-label="Open Research Buddy"
        onClick={() => window.buddy?.call('showWorkspace')}
      >
        <Pip happy />
      </button>
      <div className="pet-controls">
        <button onClick={() => window.buddy?.call('showWorkspace')}>Let’s think together</button>
        <button aria-label="Hide companion" onClick={() => window.buddy?.call('hidePet')}>
          <X size={13} />
        </button>
      </div>
    </main>
  );
}
