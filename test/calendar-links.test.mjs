/**
 * Checks for calendar export links. Run: npm test
 * The critical bit is DST: Prague is UTC+2 in summer, UTC+1 in winter.
 */
import {
  zonedTimeToUtc,
  toCompactUtc,
  googleCalendarUrl,
  icsBody,
} from '../src/lib/calendar-links.ts';

const TZ = 'Europe/Prague';
let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const utc = (date, time) => toCompactUtc(zonedTimeToUtc(date, time, TZ));

// --- DST correctness -------------------------------------------------------
check('summer 18:30 Prague is 16:30Z', utc('2026-09-02', '18:30'), '20260902T163000Z');
check('winter 18:30 Prague is 17:30Z', utc('2026-12-02', '18:30'), '20261202T173000Z');
// Clocks go back 2026-10-25 at 03:00 local.
check('day before autumn switch', utc('2026-10-24', '18:30'), '20261024T163000Z');
check('day after autumn switch', utc('2026-10-26', '18:30'), '20261026T173000Z');
// Clocks go forward 2027-03-28 at 02:00 local.
check('day before spring switch', utc('2027-03-27', '18:30'), '20270327T173000Z');
check('day after spring switch', utc('2027-03-29', '18:30'), '20270329T163000Z');

// --- ics structure ---------------------------------------------------------
const event = {
  date: '2026-09-02',
  start: '18:30',
  end: '23:00',
  title: 'Stream',
  description: 'Casy jsou priblizne.',
  url: 'https://www.twitch.tv/keodacz',
};

const ics = icsBody(event, TZ);
check('ics opens correctly', ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0'), true);
check('ics closes correctly', ics.endsWith('END:VCALENDAR\r\n'), true);
check('ics uses CRLF only', /(?<!\r)\n/.test(ics), false);
check('ics start instant', ics.includes('DTSTART:20260902T163000Z'), true);
check('ics end instant', ics.includes('DTEND:20260902T210000Z'), true);
check('ics dtstamp is stable', ics.includes('DTSTAMP:20260902T163000Z'), true);
check('ics uid is per-day', ics.includes('UID:stream-2026-09-02@keoda.cz'), true);
check('ics rebuild is byte-identical', icsBody(event, TZ), ics);

// A stream listed past midnight must not produce a negative duration.
const overnight = icsBody({ ...event, start: '22:00', end: '01:00' }, TZ);
check('overnight start', overnight.includes('DTSTART:20260902T200000Z'), true);
check('overnight end rolls over', overnight.includes('DTEND:20260902T230000Z'), true);

// --- RFC 5545 escaping -----------------------------------------------------
const risky = icsBody(
  { ...event, title: 'A, B; C\\D', description: 'radek\nradek' },
  TZ,
);
check('comma escaped', risky.includes('SUMMARY:A\\, B'), true);
check('semicolon escaped', risky.includes('B\\; C'), true);
check('backslash escaped', risky.includes('C\\\\D'), true);
check('newline escaped', risky.includes('DESCRIPTION:radek\\nradek'), true);

// --- google url ------------------------------------------------------------
const url = new URL(googleCalendarUrl(event, TZ));
check('google host', url.host, 'calendar.google.com');
check('google action', url.searchParams.get('action'), 'TEMPLATE');
check('google title', url.searchParams.get('text'), 'Stream');
check('google dates', url.searchParams.get('dates'), '20260902T163000Z/20260902T210000Z');
check('google timezone', url.searchParams.get('ctz'), 'Europe/Prague');
check('google details', url.searchParams.get('details'), 'Casy jsou priblizne.');

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} calendar-link checks passed.`);
