type CalendarEvent = {
  id: string;
  title: string;
  details?: string;
  dueAt: string;
  durationMinutes: number;
};
function boundaries(event: CalendarEvent) {
  const start = new Date(event.dueAt);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isInteger(event.durationMinutes) ||
    event.durationMinutes < 5 ||
    event.durationMinutes > 1440
  )
    throw new Error('Choose a valid event time and length.');
  if (!event.title?.trim()) throw new Error('Give your event a title.');
  const end = new Date(start.getTime() + event.durationMinutes * 60000);
  return [start, end].map((d) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z'),
  );
}
export function googleCalendarUrl(event: CalendarEvent): string {
  const [start, end] = boundaries(event);
  const url = new URL('https://calendar.google.com/calendar/r/eventedit');
  url.search = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: event.details ?? '',
  }).toString();
  return url.toString();
}
function escape(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}
function fold(line: string) {
  const parts: string[] = [];
  let part = '';
  let length = 0;
  for (const c of line) {
    const bytes = Buffer.byteLength(c);
    if (length + bytes > 73) {
      parts.push(part);
      part = ' ';
      length = 1;
    }
    part += c;
    length += bytes;
  }
  parts.push(part);
  return parts.join('\r\n');
}
export function calendarFile(event: CalendarEvent, now = new Date()): string {
  const [start, end] = boundaries(event);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Research Buddy//Reminders//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escape(event.id)}@research-buddy.local`,
    `DTSTAMP:${now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z')}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.details ?? '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .map(fold)
    .join('\r\n');
}
