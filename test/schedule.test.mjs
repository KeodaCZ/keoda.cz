/**
 * Sanity checks for the schedule logic. Run: npm test
 * Uses fixed "today" values so results never depend on the real date.
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

// --- recurring pattern -----------------------------------------------------
// 2026-09-02 is a Wednesday; Tue/Thu are free days and must be skipped.
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
check('non-leap Feb 2027', dates('2027-02-26', 4), ['2027-02-26', '2027-02-27', '2027-02-28', '2027-03-01']);

// --- DST: Czech clocks change 2026-10-25 and 2027-03-29 --------------------
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

// --- exceptions ------------------------------------------------------------
const off = [{ date: '2026-09-04', status: 'off', note: 'svatba' }];
const cancelled = getUpcomingDays(PATTERN, off, '2026-09-02', 7)[1];
check('cancelled day still listed', cancelled.date, '2026-09-04');
check('cancelled is not streaming', cancelled.streaming, false);
check('cancelled hides start time', cancelled.start, undefined);
check('cancelled keeps note', cancelled.note, 'svatba');

const moved = [{ date: '2026-09-05', status: 'moved', note: 'start ~21:00' }];
const movedDay = getUpcomingDays(PATTERN, moved, '2026-09-02', 7).find((d) => d.date === '2026-09-05');
check('moved still streaming', movedDay.streaming, true);
check('moved drops pattern time', movedDay.start, undefined);
check('moved keeps note', movedDay.note, 'start ~21:00');

const game = [{ date: '2026-09-06', game: 'Dead by Daylight' }];
const gameDay = getUpcomingDays(PATTERN, game, '2026-09-02', 7).find((d) => d.date === '2026-09-06');
check('game keeps normal time', gameDay.start, '18:30');
check('game carried through', gameDay.game, 'Dead by Daylight');

// An exception can add a stream on a normally free day (Tuesday).
const bonus = [{ date: '2026-09-08', game: 'bonus stream' }];
check('exception adds free-day stream', dates('2026-09-02', 7, bonus), [
  '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08',
]);

// Past exceptions must disappear without any cleanup.
check('past exception ignored', getBanner(PATTERN, off, '2026-09-05'), null);

// --- banner ----------------------------------------------------------------
check('no exceptions, no banner', getBanner(PATTERN, NONE, '2026-09-02'), null);
check('banner names the weekday', getBanner(PATTERN, off, '2026-09-02'), {
  label: 'V pátek nestreamuju', detail: 'svatba',
});
check('banner says Dnes', getBanner(PATTERN, [{ date: '2026-09-02', status: 'off' }], '2026-09-02'), {
  label: 'Dnes nestreamuju', detail: undefined,
});
check('banner says Zítra', getBanner(PATTERN, [{ date: '2026-09-05', status: 'off' }], '2026-09-04'), {
  label: 'Zítra nestreamuju', detail: undefined,
});
check('banner uses "Ve" for Wednesday', getBanner(PATTERN, [{ date: '2026-09-09', status: 'off' }], '2026-09-05'), {
  label: 'Ve středu nestreamuju', detail: undefined,
});
check('moved shows in banner', getBanner(PATTERN, moved, '2026-09-02'), {
  label: 'V sobotu streamuju jinak', detail: 'start ~21:00',
});
check('game-only exception is not banner-worthy', getBanner(PATTERN, game, '2026-09-02'), null);
check('banner ignores beyond 7 days', getBanner(PATTERN, [{ date: '2026-09-20', status: 'off' }], '2026-09-02'), null);
check('banner picks soonest of two', getBanner(PATTERN, [
  { date: '2026-09-07', status: 'off', note: 'pozdější' },
  { date: '2026-09-04', status: 'off', note: 'dřívější' },
], '2026-09-02'), { label: 'V pátek nestreamuju', detail: 'dřívější' });

// --- timezone --------------------------------------------------------------
check('todayIn returns ISO date', /^\d{4}-\d{2}-\d{2}$/.test(todayIn('Europe/Prague')), true);

// --- explicit exception times ---------------------------------------------
const movedWithTime = [{ date: '2026-09-05', status: 'moved', start: '21:00', note: 'pozdější start' }];
const movedTimed = getUpcomingDays(PATTERN, movedWithTime, '2026-09-02', 7)
  .find((d) => d.date === '2026-09-05');
check('moved with explicit time shows it', movedTimed.start, '21:00');
check('moved with explicit time still streams', movedTimed.streaming, true);

const bonusTimed = [{ date: '2026-09-08', start: '20:00', game: 'bonus' }];
const bonusDay = getUpcomingDays(PATTERN, bonusTimed, '2026-09-02', 7)
  .find((d) => d.date === '2026-09-08');
check('free-day stream can set its own time', bonusDay.start, '20:00');

const overridden = [{ date: '2026-09-04', start: '16:00' }];
check(
  'exception time overrides pattern',
  getUpcomingDays(PATTERN, overridden, '2026-09-02', 7).find((d) => d.date === '2026-09-04').start,
  '16:00',
);
check(
  'cancelled ignores explicit time',
  getUpcomingDays(PATTERN, [{ date: '2026-09-04', status: 'off', start: '16:00' }], '2026-09-02', 7)
    .find((d) => d.date === '2026-09-04').start,
  undefined,
);

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} schedule checks passed.`);

