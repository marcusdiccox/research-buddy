import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildMonthGrid,
  calendarKeyDate,
  formatLocalDateTime,
  parseLocalDateTime,
  shiftCalendarDate,
  shiftCalendarMonth,
  toLocalDateTime,
} from '../core/date-time';
import { parseNaturalDate, type NaturalDateResult } from '../core/natural-date';
import './date-time.css';

export interface DateTimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
}

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const fullDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export function DateTimeField({
  value,
  onChange,
  label = 'Date and time',
  name,
  disabled = false,
  required = false,
}: DateTimeFieldProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const validityRef = useRef<HTMLInputElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [focusedDate, setFocusedDate] = useState('');
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [naturalText, setNaturalText] = useState('');
  const [naturalPreview, setNaturalPreview] = useState<NaturalDateResult | null>(null);
  const [naturalApplied, setNaturalApplied] = useState(false);
  const today = toLocalDateTime(new Date()).slice(0, 10);
  const days = buildMonthGrid(month);

  function openPicker() {
    if (disabled) return;
    const initial = parseLocalDateTime(value) ? value : toLocalDateTime(new Date());
    setDraftDate(initial.slice(0, 10));
    setDraftTime(initial.slice(11, 16));
    setFocusedDate(initial.slice(0, 10));
    setMonth(initial.slice(0, 7));
    setError('');
    setNaturalText('');
    setNaturalPreview(null);
    setNaturalApplied(false);
    focusDay.current = true;
    setOpen(true);
  }

  function closePicker() {
    dialogRef.current?.close();
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    validityRef.current?.setCustomValidity(
      value && !parseLocalDateTime(value) ? 'Choose a valid local date and time.' : '',
    );
  }, [value]);

  useEffect(() => {
    if (disabled && open) closePicker();
  }, [disabled, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    if (focusDay.current) {
      dialog.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus();
      focusDay.current = false;
    }
  }, [open, focusedDate, month]);

  function selectDate(date: string) {
    setDraftDate(date);
    setFocusedDate(date);
    setMonth(date.slice(0, 7));
    setError('');
    setNaturalPreview(null);
    setNaturalApplied(false);
  }

  function previewDate() {
    setNaturalApplied(false);
    setNaturalPreview(parseNaturalDate(naturalText, { now: new Date(), defaultTime: draftTime }));
  }

  function usePreview() {
    if (!naturalPreview?.ok) return;
    selectDate(naturalPreview.value.slice(0, 10));
    setDraftTime(naturalPreview.value.slice(11, 16));
    setNaturalApplied(true);
  }

  function moveMonth(amount: number) {
    // Navigate the visible month without changing the selected date or local hour.
    const base = focusedDate.slice(0, 7) === month ? focusedDate : `${month}-01`;
    const next = shiftCalendarMonth(base, amount);
    setFocusedDate(next);
    setMonth(next.slice(0, 7));
  }

  function apply() {
    if (disabled) return;
    const next = `${draftDate}T${draftTime}`;
    if (!parseLocalDateTime(next)) {
      setError('Choose a valid date and time. Clock changes can skip local times.');
      return;
    }
    onChange(next);
    closePicker();
  }

  const dialog = (
    <dialog
      ref={dialogRef}
      className="date-time-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-help`}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        closePicker();
      }}
      onClose={() => {
        setOpen(false);
        triggerRef.current?.focus();
      }}
      onKeyDown={(event) => {
        // Keep direct entry inside this picker even when it is used in an editor form.
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          if (event.target.id === `${id}-natural`) previewDate();
          else apply();
        }
      }}
    >
      <h2 id={`${id}-title`} className="date-time-sr-only">
        {label}
      </h2>
      <p id={`${id}-help`} className="date-time-sr-only">
        Use arrow keys to move days, Home and End for week edges, Page Up and Page Down for months,
        and Enter to select. Done saves; Escape cancels.
      </p>
      <div className="date-time-natural">
        <label htmlFor={`${id}-natural`}>Describe a date</label>
        <div className="date-time-natural-entry">
          <input
            id={`${id}-natural`}
            type="text"
            value={naturalText}
            placeholder="tomorrow at 3pm"
            autoComplete="off"
            maxLength={160}
            aria-invalid={naturalPreview?.ok === false}
            aria-describedby={`${id}-natural-help${naturalPreview ? ` ${id}-natural-preview` : ''}`}
            onChange={(event) => {
              setNaturalText(event.target.value);
              setNaturalPreview(null);
              setNaturalApplied(false);
            }}
          />
          <button type="button" onClick={previewDate}>
            Preview date
          </button>
        </div>
        <p id={`${id}-natural-help`} className="date-time-natural-help">
          Dates keep the selected time. “Next Friday” means next week. Use am/pm or 09:00.
        </p>
        {naturalPreview && (
          <div
            id={`${id}-natural-preview`}
            className={naturalPreview.ok ? 'date-time-natural-preview' : 'date-time-error'}
            role={naturalPreview.ok ? 'status' : 'alert'}
          >
            {naturalPreview.ok ? (
              <>
                <span>{formatLocalDateTime(naturalPreview.value)}</span>
                <button type="button" onClick={usePreview}>
                  Use date
                </button>
              </>
            ) : (
              naturalPreview.error
            )}
          </div>
        )}
        {naturalApplied && (
          <p className="date-time-natural-help" role="status">
            Date ready. Choose Done to save.
          </p>
        )}
      </div>
      <div className="date-time-inputs">
        <label htmlFor={`${id}-date`}>
          Date
          <input
            id={`${id}-date`}
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            value={draftDate}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              const date = event.target.value;
              setDraftDate(date);
              setError('');
              setNaturalPreview(null);
              setNaturalApplied(false);
              if (buildMonthGrid(date.slice(0, 7)).length) {
                setMonth(date.slice(0, 7));
                setFocusedDate(date);
              }
            }}
          />
        </label>
        <label htmlFor={`${id}-time`}>
          Time
          <input
            id={`${id}-time`}
            type="time"
            step="60"
            value={draftTime}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setDraftTime(event.target.value);
              setError('');
              setNaturalPreview(null);
              setNaturalApplied(false);
            }}
          />
        </label>
      </div>
      {error && (
        <p className="date-time-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      <div className="date-time-month">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => moveMonth(-1)}
          disabled={month === '0001-01'}
        >
          ‹
        </button>
        <span id={`${id}-month`} aria-live="polite">
          {month && monthTitle.format(parseLocalDateTime(`${month}-15T12:00`)!)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => moveMonth(1)}
          disabled={month === '9999-12'}
        >
          ›
        </button>
      </div>
      <div className="date-time-grid" role="grid" aria-labelledby={`${id}-month`}>
        <div className="date-time-week" role="row">
          {weekdays.map((day) => (
            <span key={day} role="columnheader">
              {day}
            </span>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, week) => (
          <div className="date-time-week" role="row" key={week}>
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const date = parseLocalDateTime(`${day.date}T12:00`);
              return (
                <div role="gridcell" key={day.date} aria-selected={day.date === draftDate}>
                  <button
                    type="button"
                    data-date={day.date}
                    className={day.inMonth ? undefined : 'date-time-outside'}
                    aria-label={date ? fullDate.format(date) : day.date}
                    aria-current={day.date === today ? 'date' : undefined}
                    tabIndex={day.date === focusedDate ? 0 : -1}
                    disabled={!date}
                    onFocus={() => setFocusedDate(day.date)}
                    onClick={() => {
                      focusDay.current = true;
                      selectDate(day.date);
                    }}
                    onKeyDown={(event) => {
                      if (event.altKey || event.ctrlKey || event.metaKey) return;
                      const next = calendarKeyDate(day.date, event.key);
                      if (!next) return;
                      event.preventDefault();
                      focusDay.current = true;
                      setFocusedDate(next);
                      setMonth(next.slice(0, 7));
                    }}
                  >
                    {day.day}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="date-time-footer">
        <div>
          <button type="button" onClick={() => selectDate(today)}>
            Today
          </button>
          <button type="button" onClick={() => selectDate(shiftCalendarDate(today, 1))}>
            Tomorrow
          </button>
        </div>
        <div>
          <button type="button" onClick={closePicker}>
            Cancel
          </button>
          <button type="button" className="date-time-done" onClick={apply}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );

  return (
    <span className="date-time-field">
      <button
        type="button"
        className="date-time-trigger"
        ref={triggerRef}
        aria-label={label}
        aria-describedby={`${id}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={openPicker}
      >
        <span aria-hidden="true" className="date-time-symbol">
          ▦
        </span>
        <span id={`${id}-value`}>{formatLocalDateTime(value)}</span>
      </button>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <input
        ref={validityRef}
        className="date-time-constraint"
        type="text"
        value={value}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          openPicker();
          setError('Choose a date and time before saving.');
        }}
      />
      {typeof document !== 'undefined' && createPortal(dialog, document.body)}
    </span>
  );
}
