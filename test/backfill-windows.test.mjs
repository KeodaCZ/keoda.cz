/**
 * Checks for the backfill's window walk. Run: npm test
 *
 * There is no "get all clips" call, so the whole archive arrives through these
 * windows. A gap between two of them is not an error anyone would see — it is
 * just clips that never appear on the site, from a script that reports success.
 * So what these check is coverage: the windows must tile the range with no
 * hole, reach the floor exactly, and never run off past it.
 */
import { monthWindows } from '../scripts/backfill-clips.mjs';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const d = (iso) => new Date(iso);
const day = (date) => date.toISOString().slice(0, 10);

// --- The shape of one ordinary run ---------------------------------------

const from = d('2023-01-15T00:00:00Z');
const to = d('2023-04-15T00:00:00Z');
const three = monthWindows(from, to);

check('three months make three windows', three.length, 3);
check(
  'newest first',
  three.map((w) => day(w.end)),
  ['2023-04-15', '2023-03-15', '2023-02-15'],
);
check('the last window starts at the floor', day(three.at(-1).start), '2023-01-15');
check('the first window ends at the ceiling', day(three[0].end), '2023-04-15');

// --- Coverage: no gaps, no overshoot ------------------------------------

/** Every window's start is the previous one's end, walking backwards. */
function tiles(windows) {
  for (let i = 0; i < windows.length - 1; i += 1) {
    if (windows[i].start.getTime() !== windows[i + 1].end.getTime()) return false;
  }
  return true;
}

check('windows tile with no gap', tiles(three), true);
check('nothing reaches past the floor', three.every((w) => w.start >= from), true);
check('nothing reaches past the ceiling', three.every((w) => w.end <= to), true);

// A real span: the channel goes back years, and month-arithmetic bugs show up
// as an off-by-one only after crossing a short month or a leap year.
const long = monthWindows(d('2021-12-31T00:00:00Z'), d('2026-09-08T00:00:00Z'));
check('a five-year span tiles too', tiles(long), true);
check('and still lands exactly on the floor', day(long.at(-1).start), '2021-12-31');
check('and covers every month of it', long.length >= 56 && long.length <= 58, true);

// --- The edges -----------------------------------------------------------

check('from == to yields nothing to fetch', monthWindows(d('2026-01-01'), d('2026-01-01')), []);
check(
  'a future floor yields nothing rather than looping',
  monthWindows(d('2027-01-01'), d('2026-01-01')),
  [],
);

const partial = monthWindows(d('2026-08-20T00:00:00Z'), d('2026-09-08T00:00:00Z'));
check('a sub-month span is one window', partial.length, 1);
check('clamped to the floor, not a month before it', day(partial[0].start), '2026-08-20');

// The 31st: stepping back a month from 31 March would land on a day February
// does not have. Date normalises that forward, which must not open a gap.
const shortMonth = monthWindows(d('2026-01-01T00:00:00Z'), d('2026-03-31T00:00:00Z'));
check('a 31st start still tiles across February', tiles(shortMonth), true);
check('and still stops at the floor', day(shortMonth.at(-1).start), '2026-01-01');

// --- The floor is the account's own creation date -------------------------
//
// Not asserted here (it comes from the API) but worth pinning the consequence:
// one day of slack means the earliest window always opens before the first
// possible clip, so nothing can fall off the old end.
const created = d('2020-06-15T12:34:56Z');
const withSlack = new Date(created.getTime() - 86400000);
check('the slack day precedes creation', withSlack < created, true);
check('by exactly one day', (created - withSlack) / 86400000, 1);

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} backfill-window checks passed.`);
