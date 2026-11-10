import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, Sprout } from 'lucide-react';
import { Fox } from './Fox';

export function Pip({
  small = false,
  happy = false,
  appearance = 'red',
  species = 'fox',
}: {
  small?: boolean;
  happy?: boolean;
  appearance?: import('../shared/contracts').PetPreferences['petAppearance'];
  species?: import('../shared/contracts').PetPreferences['petSpecies'];
}) {
  return (
    <div className={`pip ${small ? 'pip-small' : ''}`} aria-hidden="true">
      <Fox pose={happy ? 'waving' : 'idle'} appearance={appearance} species={species} />
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

export function SettingToggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`toggle-track ${checked ? 'on' : ''}`} aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
