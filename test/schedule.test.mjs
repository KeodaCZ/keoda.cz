/**
 * Sanity checks for the schedule logic. Run: npm test
 * Uses fixed "today" values so results never depend on the real date.
 *
 * Weekday reference for the dates used below:
 *   2026-09-02 Wed · 09-04 Fri · 09-05 Sat · 09-06 Sun · 09-07 Mon · 09-08 Tue
 * Pattern streams Mon/Wed/Fri/Sat/Sun, so Tue and Thu are free days.
 */
import {
  addDays,
  dayLabel,
  getUpcomingDays,
  getBanners,
  mergeExceptions,
  todayIn,
  weekdayLocative,
} from '../src/lib/schedule-core.ts';

/** Banners are a list now; most checks care about the first (soonest) one. */
const firstBanner = (pattern, exceptions, today) =>
  getBanners(pattern, exceptions, today)[0] ?? null;

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
check('no exceptions, no banner', firstBanner(PATTERN, NONE, '2026-09-02'), null);
check('cancelled banners with weekday', firstBanner(PATTERN, off, '2026-09-02'), {
  label: 'V pátek nestreamuju', detail: 'svatba',
});
check('cancelled today reads Dnes', firstBanner(PATTERN, [{ date: '2026-09-02', status: 'off' }], '2026-09-02'), {
  label: 'Dnes nestreamuju', detail: undefined,
});
check('cancelled tomorrow reads Zítra', firstBanner(PATTERN, [{ date: '2026-09-05', status: 'off' }], '2026-09-04'), {
  label: 'Zítra nestreamuju', detail: undefined,
});
check('wednesday uses "Ve"', firstBanner(PATTERN, [{ date: '2026-09-09', status: 'off' }], '2026-09-05'), {
  label: 'Ve středu nestreamuju', detail: undefined,
});
check('changed time banners the new time', firstBanner(PATTERN, later, '2026-09-02'), {
  label: 'V pátek streamuju od 20:00', detail: 'pozdější start',
});
check('undecided time banners', firstBanner(PATTERN, unsure, '2026-09-02'), {
  label: 'V pátek streamuju, čas ještě nevím', detail: 'čas dám vědět na Discordu',
});

// --- banner: what must stay quiet ------------------------------------------
check('game on a pattern day is silent', firstBanner(PATTERN, game, '2026-09-02'), null);
check('same-as-pattern time is silent', firstBanner(PATTERN, [{ date: '2026-09-04', start: '18:30' }], '2026-09-02'), null);
check('note alone is silent', firstBanner(PATTERN, [{ date: '2026-09-04', note: 'hrajeme dál' }], '2026-09-02'), null);
check('bonus day alone is silent', firstBanner(PATTERN, bonus, '2026-09-02'), null);
check('beyond 7 days is silent', firstBanner(PATTERN, [{ date: '2026-09-20', status: 'off' }], '2026-09-02'), null);
check('past exception is silent', firstBanner(PATTERN, off, '2026-09-05'), null);

// --- banner: highlight opt-in ----------------------------------------------
check('highlighted bonus day banners', firstBanner(PATTERN, [{ ...bonus[0], highlight: true }], '2026-09-02'), {
  label: 'V úterý bonusový stream od 20:00', detail: undefined,
});
check(
  'highlighted bonus day without a time',
  firstBanner(PATTERN, [{ date: '2026-09-08', highlight: true }], '2026-09-02'),
  { label: 'V úterý bonusový stream', detail: undefined },
);
// A programme swap between two normal stream days: nothing else changed, so
// the note itself is the message.
check(
  'highlighted note carries itself',
  firstBanner(PATTERN, [{ date: '2026-09-05', highlight: true, note: 'program se přesouvá na pondělí' }], '2026-09-02'),
  { label: 'V sobotu: program se přesouvá na pondělí' },
);
check(
  'highlighted game with no note',
  firstBanner(PATTERN, [{ date: '2026-09-05', highlight: true, game: 'Silent Hill 2' }], '2026-09-02'),
  { label: 'V sobotu: Silent Hill 2' },
);
check(
  'highlighted with nothing to say',
  firstBanner(PATTERN, [{ date: '2026-09-05', highlight: true }], '2026-09-02'),
  { label: 'V sobotu speciální stream' },
);

// --- banner: picking between several ---------------------------------------
check('banner picks the soonest', firstBanner(PATTERN, [
  { date: '2026-09-07', status: 'off', note: 'pozdější' },
  { date: '2026-09-04', status: 'off', note: 'dřívější' },
], '2026-09-02'), { label: 'V pátek nestreamuju', detail: 'dřívější' });
check('banner skips silent entries to find a real one', firstBanner(PATTERN, [
  { date: '2026-09-04', game: 'jen hra' },
  { date: '2026-09-06', status: 'off', note: 'volno' },
], '2026-09-02'), { label: 'V neděli nestreamuju', detail: 'volno' });

// --- timezone --------------------------------------------------------------
check('todayIn returns ISO date', /^\d{4}-\d{2}-\d{2}$/.test(todayIn('Europe/Prague')), true);


// --- several banners at once -----------------------------------------------
const busyWeek = [
  { date: '2026-09-04', status: 'off', note: 'svatba' },
  { date: '2026-09-05', start: '21:00' },
  { date: '2026-09-07', timeUnknown: true },
];
check('all changes become banners, soonest first', getBanners(PATTERN, busyWeek, '2026-09-02').map((b) => b.label), [
  'V pátek nestreamuju',
  'V sobotu streamuju od 21:00',
  'V pondělí streamuju, čas ještě nevím',
]);
check('quiet entries never become banners', getBanners(PATTERN, [
  { date: '2026-09-04', game: 'hra' },
  { date: '2026-09-05', note: 'poznámka' },
], '2026-09-02'), []);
check('banner list is empty without exceptions', getBanners(PATTERN, NONE, '2026-09-02'), []);

// --- duplicate dates -------------------------------------------------------
const dupes = [
  { date: '2026-09-04', status: 'off' },
  { date: '2026-09-04', note: 'svatba' },
];
const dupResult = mergeExceptions(dupes);
check('duplicates collapse to one entry', dupResult.merged.length, 1);
check('duplicates are reported', dupResult.duplicates, [{ date: '2026-09-04', count: 2 }]);
check('merged entry keeps both fields', dupResult.merged[0], {
  date: '2026-09-04', status: 'off', note: 'svatba',
});
check('unique dates report nothing', mergeExceptions([
  { date: '2026-09-04' }, { date: '2026-09-05' },
]).duplicates, []);
check('three of the same date are counted', mergeExceptions([
  { date: '2026-09-04' }, { date: '2026-09-04' }, { date: '2026-09-04' },
]).duplicates, [{ date: '2026-09-04', count: 3 }]);
check('merged output is date-sorted', mergeExceptions([
  { date: '2026-09-08' }, { date: '2026-09-04' }, { date: '2026-09-06' },
]).merged.map((e) => e.date), ['2026-09-04', '2026-09-06', '2026-09-08']);

// Later entries win field by field, so a correction still lands...
check('later time wins', mergeExceptions([
  { date: '2026-09-04', start: '19:00' },
  { date: '2026-09-04', start: '21:00' },
]).merged[0].start, '21:00');
// ...but the CMS's empty "no choice" value must not erase a real one.
check('empty status does not erase off', mergeExceptions([
  { date: '2026-09-04', status: 'off' },
  { date: '2026-09-04', status: '' },
]).merged[0].status, 'off');

// A duplicated date must still produce exactly one calendar row and one banner.
check('duplicate date yields one row', dates('2026-09-02', 7, dupes), [
  '2026-09-02', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
]);
check('duplicate date yields one banner', getBanners(PATTERN, dupes, '2026-09-02'), [
  { label: 'V pátek nestreamuju', detail: 'svatba' },
]);
// The old behaviour kept only the first entry, which could drop a cancellation.
check('cancellation survives being second', getBanners(PATTERN, [
  { date: '2026-09-04', game: 'hra' },
  { date: '2026-09-04', status: 'off' },
], '2026-09-02').map((b) => b.label), ['V pátek nestreamuju']);


// --- empty strings from the CMS --------------------------------------------
// Sveltia writes every field it knows about, so untouched ones arrive as ''
// rather than being absent. Real data from /admin looks like this.
const fromCms = [
  { date: '2026-09-02', status: '', start: '20:00', timeUnknown: false, game: 'Skyrim', note: '', highlight: false },
  { date: '2026-09-03', status: '', start: '18:30', timeUnknown: false, game: '', note: 'Bonusový testovací stream', highlight: true },
  { date: '2026-09-04', status: 'off', start: '', timeUnknown: false, game: '', note: 'Jedu k rodičům', highlight: false },
];
const cmsDay = (date) => getUpcomingDays(PATTERN, fromCms, '2026-09-02', 7).find((d) => d.date === date);

check('empty game becomes unset', cmsDay('2026-09-03').game, undefined);
check('empty note becomes unset', cmsDay('2026-09-02').note, undefined);
check('empty status is not a cancellation', cmsDay('2026-09-02').streaming, true);
check('real status still cancels', cmsDay('2026-09-04').streaming, false);
// An empty start must fall back to the pattern, not render as no time at all.
check(
  'empty start falls back to the pattern',
  getUpcomingDays(PATTERN, [{ date: '2026-09-04', status: '', start: '', game: '' }], '2026-09-02', 7)
    .find((d) => d.date === '2026-09-04').start,
  '18:30',
);
check('explicit start is kept', cmsDay('2026-09-02').start, '20:00');
check('false booleans stay false', cmsDay('2026-09-02').timeUnknown, false);
check('true booleans stay true', cmsDay('2026-09-03').highlight, true);

// The whole week as it renders from that real data.
check('real CMS data banners', getBanners(PATTERN, fromCms, '2026-09-02').map((b) => b.label), [
  'Dnes streamuju od 20:00',
  'Zítra bonusový stream od 18:30',
  'V pátek nestreamuju',
]);

// --- weekdayLocative: names the day for the offline strip ---------------
// Czech needs the locative case and the preposition changes with it, which is
// the only reason this isn't a plain lookup. Lowercase, to sit mid-sentence.
check('locative Monday', weekdayLocative('2026-09-07'), 'v pondělí');
check('locative Tuesday', weekdayLocative('2026-09-08'), 'v úterý');
check('locative Wednesday takes "ve"', weekdayLocative('2026-09-02'), 've středu');
check('locative Thursday takes "ve"', weekdayLocative('2026-09-03'), 've čtvrtek');
check('locative Friday', weekdayLocative('2026-09-04'), 'v pátek');
check('locative Saturday', weekdayLocative('2026-09-05'), 'v sobotu');
check('locative Sunday', weekdayLocative('2026-09-06'), 'v neděli');
// Purely a function of the date, so a page built yesterday still labels it
// right — that's why the component computes "dnes"/"zítra" in the browser
// instead of baking them in. A DST switch must not shift the day either.
check('locative across the spring switch', weekdayLocative('2027-03-28'), 'v neděli');
check('locative across the autumn switch', weekdayLocative('2026-10-25'), 'v neděli');
check('locative on a leap day', weekdayLocative('2028-02-29'), 'v úterý');

// --- dayLabel: resolved in the browser, so the build going stale cannot lie --
// 2026-09-11 is a Friday; 09-12 Saturday; 09-13 Sunday.
check('today', dayLabel('2026-09-11', '2026-09-11', 'pátek'), 'Dnes');
check('tomorrow', dayLabel('2026-09-12', '2026-09-11', 'sobota'), 'Zítra');
check('further out falls back to the weekday', dayLabel('2026-09-13', '2026-09-11', 'neděle'), 'neděle');
// A day already past must not be labelled "Dnes" just because the build was.
check('yesterday is not today', dayLabel('2026-09-10', '2026-09-11', 'čtvrtek'), 'čtvrtek');

// The scenario this exists for: the page was built on the 11th and is being
// read on the 12th, because the nightly rebuild is running hours late.
check('a stale build no longer calls the 11th "Dnes"', dayLabel('2026-09-11', '2026-09-12', 'pátek'), 'pátek');
check('and the 12th becomes "Dnes"', dayLabel('2026-09-12', '2026-09-12', 'sobota'), 'Dnes');

// Month and year boundaries, where naive date maths goes wrong.
check('across a month end', dayLabel('2026-10-01', '2026-09-30', 'čtvrtek'), 'Zítra');
check('across a year end', dayLabel('2027-01-01', '2026-12-31', 'pátek'), 'Zítra');
// Adding a day must not be affected by DST — these are plain dates.
check('across the spring DST switch', dayLabel('2027-03-28', '2027-03-27', 'neděle'), 'Zítra');
check('across the autumn DST switch', dayLabel('2026-10-25', '2026-10-24', 'neděle'), 'Zítra');

check('addDays is exported and works over a month end', addDays('2026-09-30', 1), '2026-10-01');
check('and backwards', addDays('2026-10-01', -1), '2026-09-30');
check('and over a leap day', addDays('2028-02-28', 1), '2028-02-29');

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} schedule checks passed.`);
