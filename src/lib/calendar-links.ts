/**
 * "Add to calendar" links for a stream slot.
 *
 * Schedule data stores Prague wall-clock times (never UTC — see schedule-core).
 * Calendar exports need an unambiguous instant, so times are converted to UTC
 * here, at build time, with the offset looked up per date. That matters because
 * 18:30 in Prague is 16:30Z in summer but 17:30Z in winter.
 */

export interface CalendarEvent {
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' Prague wall clock */
  start: string;
  /** 'HH:MM' Prague wall clock */
  end: string;
  title: string;
  description?: string;
  url?: string;
}

/** Offset of `timeZone` from UTC, in minutes, at a given instant. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl can emit hour '24' for midnight.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * The UTC instant matching a wall-clock date+time in `timeZone`.
 * Applied twice so a DST boundary resolves correctly.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);

  let instant = new Date(naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000);
  instant = new Date(naive - zoneOffsetMinutes(instant, timeZone) * 60_000);
  return instant;
}

/** '20260902T163000Z' — the basic UTC form iCalendar and Google both accept. */
export function toCompactUtc(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function eventRange(event: CalendarEvent, timeZone: string): [string, string] {
  const start = zonedTimeToUtc(event.date, event.start, timeZone);
  let end = zonedTimeToUtc(event.date, event.end, timeZone);
  // An end at or before the start means the stream runs past midnight.
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return [toCompactUtc(start), toCompactUtc(end)];
}

export function googleCalendarUrl(event: CalendarEvent, timeZone: string): string {
  const [start, end] = eventRange(event, timeZone);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    ctz: timeZone,
  });
  if (event.description) params.set('details', event.description);
  if (event.url) params.set('location', event.url);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** iCalendar text values must escape these, per RFC 5545. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** A single-event .ics file. CRLF line endings are required by RFC 5545. */
export function icsBody(event: CalendarEvent, timeZone: string): string {
  const [start, end] = eventRange(event, timeZone);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//keoda.cz//stream schedule//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:stream-${event.date}@keoda.cz`,
    // Deliberately derived from the event, not the clock, so rebuilding the
    // site produces byte-identical files.
    `DTSTAMP:${start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
