import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  calendarKeyDate,
  formatLocalDateTime,
  parseLocalDateTime,
  shiftCalendarDate,
  shiftCalendarMonth,
  toLocalDateTime,
} from '../src/core/date-time';

describe('local date and time', () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('preserves the local wall-clock time rather than converting it to UTC', () => {
    const date = parseLocalDateTime('2026-11-04T16:35');
    expect(date).not.toBeNull();
    expect(date?.getHours()).toBe(16);
    expect(date?.getMinutes()).toBe(35);
    expect(toLocalDateTime(date!)).toBe('2026-11-04T16:35');
  });

  it.each([
    '',
    '2026-02-29T12:00',
    '2024-02-30T12:00',
    '2026-04-31T12:00',
    '2026-00-01T12:00',
    '2026-13-01T12:00',
    '2026-11-04T24:00',
    '2026-11-04T12:60',
    '2026-11-04T12:00Z',
    '2026-1-04T12:00',
    '2026-11-04',
    '0000-01-01T00:00',
  ])('rejects invalid or nonlocal date/time %j', (value) => {
    expect(parseLocalDateTime(value)).toBeNull();
  });

  it('accepts leap day and years below 100 without the Date constructor century offset', () => {
    expect(toLocalDateTime(parseLocalDateTime('2024-02-29T23:59')!)).toBe('2024-02-29T23:59');
    expect(toLocalDateTime(parseLocalDateTime('0099-01-03T08:15')!)).toBe('0099-01-03T08:15');
  });

  it('rejects a spring-forward gap and accepts both surrounding local times', () => {
    process.env.TZ = 'America/New_York';
    expect(parseLocalDateTime('2026-03-08T02:30')).toBeNull();
    expect(parseLocalDateTime('2026-03-08T01:30')).not.toBeNull();
    expect(parseLocalDateTime('2026-03-08T03:30')).not.toBeNull();
    expect(toLocalDateTime(parseLocalDateTime('2026-11-01T01:30')!)).toBe('2026-11-01T01:30');
  });

  it('formats a readable trigger and a useful empty fallback', () => {
    const text = formatLocalDateTime('2026-11-04T16:35', 'en-US');
    expect(text).toContain('Nov');
    expect(text).toContain('4');
    expect(text).toContain('2026');
    expect(text).toMatch(/4:35\s?PM/);
    expect(formatLocalDateTime('')).toBe('Choose date and time');
  });
});

describe('calendar navigation', () => {
  it('builds Sunday-first complete weeks including neighboring month dates', () => {
    const days = buildMonthGrid('2026-11');
    expect(days).toHaveLength(35);
    expect(days[0]).toEqual({ date: '2026-11-01', day: 1, inMonth: true });
    expect(days[29]).toEqual({ date: '2026-11-30', day: 30, inMonth: true });
    expect(days[34]).toEqual({ date: '2026-12-05', day: 5, inMonth: false });
    const sixWeeks = buildMonthGrid('2026-08');
    expect(sixWeeks).toHaveLength(42);
    expect(sixWeeks[0].date).toBe('2026-07-26');
    expect(sixWeeks[41].date).toBe('2026-09-05');
  });

  it('includes leap day in February', () => {
    expect(buildMonthGrid('2024-02').filter((day) => day.inMonth)).toHaveLength(29);
    expect(buildMonthGrid('2024-02').find((day) => day.date === '2024-02-29')?.day).toBe(29);
    expect(buildMonthGrid('bad')).toEqual([]);
  });

  it.each([
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-03-01', -1, '2024-02-29'],
    ['2026-03-07', 2, '2026-03-09'],
    ['2026-11-01', 7, '2026-11-08'],
  ])('moves calendar days from %s by %i', (date, amount, expected) => {
    expect(shiftCalendarDate(date, amount)).toBe(expected);
  });

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-12-31', 1, '2027-01-31'],
    ['2026-01-31', -1, '2025-12-31'],
    ['2024-02-29', 12, '2025-02-28'],
  ])('moves months from %s by %i and clamps the day', (date, amount, expected) => {
    expect(shiftCalendarMonth(date, amount)).toBe(expected);
  });

  it.each([
    ['ArrowLeft', '2026-11-03'],
    ['ArrowRight', '2026-11-05'],
    ['ArrowUp', '2026-10-28'],
    ['ArrowDown', '2026-11-11'],
    ['Home', '2026-11-01'],
    ['End', '2026-11-07'],
    ['PageUp', '2026-10-04'],
    ['PageDown', '2026-12-04'],
    ['Enter', null],
    ['Tab', null],
  ])('supports %s on the focused date', (key, expected) => {
    expect(calendarKeyDate('2026-11-04', key)).toBe(expected);
  });

  it('keeps calendar arithmetic within the supported year range', () => {
    expect(shiftCalendarDate('0001-01-01', -1)).toBe('0001-01-01');
    expect(shiftCalendarDate('9999-12-31', 1)).toBe('9999-12-31');
    expect(shiftCalendarMonth('0001-01-15', -1)).toBe('0001-01-15');
    expect(shiftCalendarMonth('9999-12-15', 1)).toBe('9999-12-15');
    expect(shiftCalendarDate('2026-02-30', 1)).toBe('2026-02-30');
  });
});
