import { afterEach, describe, expect, it } from 'vitest';
import { parseLocalDateTime } from '../src/core/date-time';
import { parseNaturalDate } from '../src/core/natural-date';

const now = () => parseLocalDateTime('2026-11-05T10:15')!;
const parse = (text: string, date = now(), defaultTime = '16:30') =>
  parseNaturalDate(text, { now: date, defaultTime });

describe('deterministic natural dates', () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it.each([
    ['tomorrow at 3pm', '2026-11-06T15:00'],
    ['  TOMORROW at 3:05 PM  ', '2026-11-06T15:05'],
    ['today', '2026-11-05T16:30'],
    ['today at 12pm', '2026-11-05T12:00'],
    ['tomorrow at 12am', '2026-11-06T00:00'],
    ['Friday at 09:00', '2026-11-06T09:00'],
    ['next Friday at 9am', '2026-11-13T09:00'],
    ['Monday', '2026-11-09T16:30'],
    ['in 30 minutes', '2026-11-05T10:45'],
    ['in 2 hours', '2026-11-05T12:15'],
    ['in 3 days', '2026-11-08T16:30'],
    ['in 2 weeks', '2026-11-19T16:30'],
    ['2027-02-03', '2027-02-03T16:30'],
    ['2027-02-03 14:05', '2027-02-03T14:05'],
    ['2027-02-03T14:05', '2027-02-03T14:05'],
    ['2027-02-03 at 2:05pm', '2027-02-03T14:05'],
  ])('previews %s as %s', (text, value) => {
    expect(parse(text)).toEqual({ ok: true, value });
  });

  it('uses the following calendar week for next weekday, even when it is later this week', () => {
    expect(parse('next Sunday')).toEqual({ ok: true, value: '2026-11-15T16:30' });
    expect(parse('next Monday')).toEqual({ ok: true, value: '2026-11-09T16:30' });
    expect(parse('next Thursday')).toEqual({ ok: true, value: '2026-11-12T16:30' });
    expect(parse('Thursday')).toEqual({ ok: true, value: '2026-11-05T16:30' });
    expect(parse('Thursday at 9am')).toEqual({ ok: true, value: '2026-11-12T09:00' });
  });

  it.each([
    ['2026-12-31T10:15', 'tomorrow', '2027-01-01T16:30'],
    ['2028-02-28T10:15', 'in 1 day', '2028-02-29T16:30'],
    ['2026-01-31T10:15', 'in 2 days', '2026-02-02T16:30'],
    ['2026-12-31T23:45', 'in 30 minutes', '2027-01-01T00:15'],
  ])('handles rollovers from %s with %s', (start, text, value) => {
    expect(parse(text, parseLocalDateTime(start)!)).toEqual({ ok: true, value });
  });

  it.each([
    '',
    'next month',
    '3',
    'tomorrow at 3',
    'next Friday at 9',
    '03/04/2027',
    'in 1.5 hours',
    'in -2 days',
    'in 0 minutes',
    'in 99999999999999 weeks',
    '2027-02-30',
    '2027-02-03 24:00',
    'tomorrow at 13pm',
    'tomorrow at 3:70pm',
    'today at 9am',
    'today at 10:15',
    '2026-11-04 at 3pm',
  ])('rejects unsupported, ambiguous, invalid, or elapsed input %j', (text) => {
    const result = parse(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(15);
  });

  it('explains ambiguous hours and past dates', () => {
    expect(parse('tomorrow at 3')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/am.*pm/i),
    });
    expect(parse('today at 9am')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/future/i),
    });
  });

  it('uses current local time when no default is passed and rejects an invalid default', () => {
    expect(parseNaturalDate('tomorrow', { now: now() })).toEqual({
      ok: true,
      value: '2026-11-06T10:15',
    });
    expect(parse('tomorrow', now(), '25:00').ok).toBe(false);
  });

  it('rejects invalid clocks and dates outside the supported range', () => {
    expect(parse('today', new Date(NaN)).ok).toBe(false);
    expect(parse('tomorrow', parseLocalDateTime('9999-12-31T12:00')!).ok).toBe(false);
    expect(parse('in 1 minute', parseLocalDateTime('9999-12-31T23:59')!).ok).toBe(false);
  });

  it('does calendar-day arithmetic through DST while hours mean elapsed time', () => {
    process.env.TZ = 'America/New_York';
    const start = parseLocalDateTime('2026-03-07T12:00')!;
    expect(parse('in 1 day', start, '12:00')).toEqual({ ok: true, value: '2026-03-08T12:00' });
    expect(parse('in 24 hours', start)).toEqual({ ok: true, value: '2026-03-08T13:00' });
  });

  it('rejects skipped and repeated local hours instead of silently selecting a DST interpretation', () => {
    process.env.TZ = 'America/New_York';
    const beforeSpring = parseLocalDateTime('2026-03-07T12:00')!;
    const beforeFall = parseLocalDateTime('2026-10-31T12:00')!;
    expect(parse('tomorrow at 2:30am', beforeSpring).ok).toBe(false);
    expect(parse('tomorrow at 1:30am', beforeFall)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/clock.*twice|twice.*clock/i),
    });
    expect(parse('tomorrow at 3:30am', beforeSpring)).toEqual({
      ok: true,
      value: '2026-03-08T03:30',
    });
  });
});
