/**
 * Sanity checks for the schedule logic. Run: npm test
 * Uses fixed "today" values so results never depend on the real date.
 *
 * Weekday reference for the dates used below:
 *   2026-09-02 Wed · 09-04 Fri · 09-05 Sat · 09-06 Sun · 09-07 Mon · 09-08 Tue
 * Pattern streams Mon/Wed/Fri/Sat/Sun, so Tue and Thu are free days.
 */
import { getUpcomingDays, getBanner, todayIn } from '../src/lib/schedule-core.ts';

const PATTERN = { mon: '18:30', wed: '18:30', fri: '18:30', sat: '18:30', sun: '18:30' };
const NONE = [];

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const dates = (today, count, exceptions = NONE) =>
  getUpcomingDays(PATTERN, exceptions, today, count).map((d) => d.date);
const dayOn = (date, exceptions, today = '2026-09-02', count = 7) =>
  getUpcomingDays(PATTERN, exceptions, today, count).find((d) => d.date === date);

// --- recurring pattern -----------------------------------------------------
check('week from Wed skips free days', dates('2026-09-02', 7), [
  '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
]);
const week = getUpcomingDays(PATTERN, NONE, '2026-09-02', 7);
check('czech weekday names', week.map((d) => d.weekday), [
  'středa', 'pátek', 'sobota', 'neděle', 'pondělí',
]);
check('every day starts 18:30', week.map((d) => d.start), Array(5).fill('18:30'));
check('today flagged exactly once', week.filter((d) => d.isToday).map((d) => d.date), ['2026-09-02']);
check('tomorrow flag ignores free days', week.filter((d) => d.isTomorrow), []);
check('czech day/month format', week[1].dayMonth, '4. 9.');
check('empty pattern yields nothing', getUpcomingDays({}, NONE, '2026-09-02', 14), []);

// --- calendar boundaries ---------------------------------------------------
check('crosses month end', dates('2026-09-30', 3), ['2026-09-30', '2026-10-02']);
check('crosses new year', dates('2026-12-31', 3), ['2027-01-01', '2027-01-02']);
check('leap day skipped when Tue free', dates('2028-02-28', 3), ['2028-02-28', '2028-03-01']);
check(
  'leap day included when Tue streams',
  getUpcomingDays({ ...PATTERN, tue: '18:30' }, NONE, '2028-02-28', 3).map((d) => d.date),
  ['2028-02-28', '2028-02-29', '2028-03-01'],
);
check('non-leap Feb 2027', dates('2027-02-26', 4), [
  '2027-02-26', '2027-02-27', '2027-02-28', '2027-03-01',
]);

// --- DST: Czech clocks change 2026-10-25 and 2027-03-28 --------------------
check(
  'autumn DST keeps 18:30',
  getUpcomingDays(PATTERN, NONE, '2026-10-24', 4).map((d) => `${d.date} ${d.start}`),
  ['2026-10-24 18:30', '2026-10-25 18:30', '2026-10-26 18:30'],
);
check(
  'spring DST keeps 18:30',
  getUpcomingDays(PATTERN, NONE, '2027-03-27', 3).map((d) => `${d.date} ${d.start}`),
  ['2027-03-27 18:30', '2027-03-28 18:30', '2027-03-29 18:30'],
);

// --- cancelled streams -----------------------------------------------------
const off = [{ date: '2026-09-04', status: 'off', note: 'svatba' }];
const cancelled = dayOn('2026-09-04', off);
check('cancelled day still listed', cancelled.date, '2026-09-04');
check('cancelled is not streaming', cancelled.streaming, false);
check('cancelled hides start time', cancelled.start, undefined);
check('cancelled keeps note', cancelled.note, 'svatba');
check('cancelled carries status', cancelled.status, 'off');
check('cancelled is not "added"', cancelled.added, false);
check(
  'cancelled ignores explicit time',
  dayOn('2026-09-04', [{ date: '2026-09-04', status: 'off', start: '16:00' }]).start,
  undefined,
);
check(
  'cancelled beats timeUnknown',
  dayOn('2026-09-04', [{ date: '2026-09-04', status: 'off', timeUnknown: true }]).timeUnknown,
  false,
);

// --- changed start times ---------------------------------------------------
const later = [{ date: '2026-09-04', start: '20:00', note: 'pozdější start' }];
const moved = dayOn('2026-09-04', later);
check('changed time replaces pattern', moved.start, '20:00');
check('changed time still streams', moved.streaming, true);
check('changed time is flagged', moved.timeChanged, true);
check('changed time keeps note', moved.note, 'pozdější start');
check(
  'same time as pattern is not a change',
  dayOn('2026-09-04', [{ date: '2026-09-04', start: '18:30' }]).timeChanged,
  false,
);

// --- time not decided yet --------------------------------------------------
const unsure = [{ date: '2026-09-04', timeUnknown: true, note: 'čas dám vědět na Discordu' }];
const undecided = dayOn('2026-09-04', unsure);
check('timeUnknown still streams', undecided.streaming, true);
check('timeUnknown hides the pattern time', undecided.start, undefined);
check('timeUnknown is flagged', undecided.timeUnknown, true);
check(
  'timeUnknown wins over an explicit time',
  dayOn('2026-09-04', [{ date: '2026-09-04', timeUnknown: true, start: '20:00' }]).start,
  undefined,
);

// --- game and note only ----------------------------------------------------
const game = [{ date: '2026-09-06', game: 'Dead by Daylight' }];
const gameDay = dayOn('2026-09-06', game);
check('game keeps normal time', gameDay.start, '18:30');
check('game carried through', gameDay.game, 'Dead by Daylight');
check('game day is not a change', gameDay.timeChanged, false);
check('game day is not "added"', gameDay.added, false);

// --- streams added to free days --------------------------------------------
const bonus = [{ date: '2026-09-08', start: '20:00', game: 'bonus' }];
check('exception adds free-day stream', dates('2026-09-02', 7, bonus), [
  '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08',
]);
const bonusDay = dayOn('2026-09-08', bonus);
check('free-day stream sets its own time', bonusDay.start, '20:00');
check('free-day stream is "added"', bonusDay.added, true);
// No pattern time exists to deviate from, so this is not a "change".
check('free-day stream is not a time change', bonusDay.timeChanged, false);

const plain = dayOn('2026-09-02', NONE);
check('plain pattern day has no status', plain.status, undefined);
check('plain pattern day is not "added"', plain.added, false);
check('plain pattern day is not highlighted', plain.highlight, false);

// --- banner: automatic cases -----------------------------------------------
check('no exceptions, no banner', getBanner(PATTERN, NONE, '2026-09-02'), null);
check('cancelled banners with weekday', getBanner(PATTERN, off, '2026-09-02'), {
  label: 'V pátek nestreamuju', detail: 'svatba',
});
check('cancelled today reads Dnes', getBanner(PATTERN, [{ date: '2026-09-02', status: 'off' }], '2026-09-02'), {
  label: 'Dnes nestreamuju', detail: undefined,
});
check('cancelled tomorrow reads Zítra', getBanner(PATTERN, [{ date: '2026-09-05', status: 'off' }], '2026-09-04'), {
  label: 'Zítra nestreamuju', detail: undefined,
});
check('wednesday uses "Ve"', getBanner(PATTERN, [{ date: '2026-09-09', status: 'off' }], '2026-09-05'), {
  label: 'Ve středu nestreamuju', detail: undefined,
});
check('changed time banners the new time', getBanner(PATTERN, later, '2026-09-02'), {
  label: 'V pátek streamuju od 20:00', detail: 'pozdější start',
});
check('undecided time banners', getBanner(PATTERN, unsure, '2026-09-02'), {
  label: 'V pátek streamuju, čas ještě nevím', detail: 'čas dám vědět na Discordu',
});

// --- banner: what must stay quiet ------------------------------------------
check('game on a pattern day is silent', getBanner(PATTERN, game, '2026-09-02'), null);
check('same-as-pattern time is silent', getBanner(PATTERN, [{ date: '2026-09-04', start: '18:30' }], '2026-09-02'), null);
check('note alone is silent', getBanner(PATTERN, [{ date: '2026-09-04', note: 'hrajeme dál' }], '2026-09-02'), null);
check('bonus day alone is silent', getBanner(PATTERN, bonus, '2026-09-02'), null);
check('beyond 7 days is silent', getBanner(PATTERN, [{ date: '2026-09-20', status: 'off' }], '2026-09-02'), null);
check('past exception is silent', getBanner(PATTERN, off, '2026-09-05'), null);

// --- banner: highlight opt-in ----------------------------------------------
check('highlighted bonus day banners', getBanner(PATTERN, [{ ...bonus[0], highlight: true }], '2026-09-02'), {
  label: 'V úterý bonusový stream od 20:00', detail: undefined,
});
check(
  'highlighted bonus day without a time',
  getBanner(PATTERN, [{ date: '2026-09-08', highlight: true }], '2026-09-02'),
  { label: 'V úterý bonusový stream', detail: undefined },
);
// A programme swap between two normal stream days: nothing else changed, so
// the note itself is the message.
check(
  'highlighted note carries itself',
  getBanner(PATTERN, [{ date: '2026-09-05', highlight: true, note: 'program se přesouvá na pondělí' }], '2026-09-02'),
  { label: 'V sobotu: program se přesouvá na pondělí' },
);
check(
  'highlighted game with no note',
  getBanner(PATTERN, [{ date: '2026-09-05', highlight: true, game: 'Silent Hill 2' }], '2026-09-02'),
  { label: 'V sobotu: Silent Hill 2' },
);
check(
  'highlighted with nothing to say',
  getBanner(PATTERN, [{ date: '2026-09-05', highlight: true }], '2026-09-02'),
  { label: 'V sobotu speciální stream' },
);

// --- banner: picking between several ---------------------------------------
check('banner picks the soonest', getBanner(PATTERN, [
  { date: '2026-09-07', status: 'off', note: 'pozdější' },
  { date: '2026-09-04', status: 'off', note: 'dřívější' },
], '2026-09-02'), { label: 'V pátek nestreamuju', detail: 'dřívější' });
check('banner skips silent entries to find a real one', getBanner(PATTERN, [
  { date: '2026-09-04', game: 'jen hra' },
  { date: '2026-09-06', status: 'off', note: 'volno' },
], '2026-09-02'), { label: 'V neděli nestreamuju', detail: 'volno' });

// --- timezone --------------------------------------------------------------
check('todayIn returns ISO date', /^\d{4}-\d{2}-\d{2}$/.test(todayIn('Europe/Prague')), true);

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} schedule checks passed.`);
