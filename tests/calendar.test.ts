import { describe, it, expect } from 'vitest';
import { googleCalendarUrl, calendarFile } from '../src/core/calendar';
const event = {
  id: 'r1',
  title: 'Review, earnings; Aster',
  details: 'First line\nSecond line',
  dueAt: '2026-11-03T14:00:00.000Z',
  durationMinutes: 30,
};
describe('calendar events', () => {
  it('opens Google with the exact title, details and unambiguous UTC times', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('text')).toBe('Review, earnings; Aster');
    expect(url.searchParams.get('dates')).toBe('20261103T140000Z/20261103T143000Z');
    expect(url.searchParams.get('details')).toBe('First line\nSecond line');
  });
  it('exports escaped ICS that cannot inject a second event', () => {
    const ics = calendarFile(
      { ...event, title: 'Review\nBEGIN:VEVENT' },
      new Date('2026-11-01T12:00:00Z'),
    );
    expect(ics).toContain('DTSTART:20261103T140000Z\r\nDTEND:20261103T143000Z');
    expect(ics).toContain('SUMMARY:Review\\nBEGIN:VEVENT');
    expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(ics).toContain('DTSTAMP:20261101T120000Z');
  });
  it('rejects invalid dates and event lengths', () => {
    expect(() => googleCalendarUrl({ ...event, dueAt: 'bad' })).toThrow();
    expect(() => calendarFile({ ...event, durationMinutes: -5 })).toThrow();
  });
});
