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
  dayReferenceFor,
  getBanners,
  mergeExceptions,
  todayIn,
  weekdayLocative,
} from '../src/lib/schedule-core.ts';

/**
 * Banners are a list; most checks care about the first (soonest) one, and
 * about the text a reader sees rather than the pieces it is assembled from.
 * `date`, `when` and `rest` exist so the browser can re-label a stale page and
 * are asserted separately below.
 */
const firstBanner = (pattern, exceptions, today) => {
  const banner = getBanners(pattern, exceptions, today)[0];
  if (!banner) return null;
  const { label, detail } = banner;
  return detail === undefined ? { label } : { label, detail };
};

/** The whole record, for the fields the re-labelling depends on. */
const firstBannerRaw = (pattern, exceptions, today) =>
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

// --- banner: nothing gets in on its own ------------------------------------
//
// Owner's call 2026-09-14: the banner used to fire by itself for a
// cancellation, a moved time or an undecided time, which put every routine
// schedule tweak on top of every page. Now `highlight` is the only way in.
// These are the cases that used to banner and must now stay quiet.

check('no exceptions, no banner', firstBanner(PATTERN, NONE, '2026-09-02'), null);
check('a cancellation alone is silent', firstBanner(PATTERN, off, '2026-09-02'), null);
check('a moved time alone is silent', firstBanner(PATTERN, later, '2026-09-02'), null);
check('an undecided time alone is silent', firstBanner(PATTERN, unsure, '2026-09-02'), null);
check('game on a pattern day is silent', firstBanner(PATTERN, game, '2026-09-02'), null);
check('same-as-pattern time is silent', firstBanner(PATTERN, [{ date: '2026-09-04', start: '18:30' }], '2026-09-02'), null);
check('note alone is silent', firstBanner(PATTERN, [{ date: '2026-09-04', note: 'hrajeme dál' }], '2026-09-02'), null);
check('bonus day alone is silent', firstBanner(PATTERN, bonus, '2026-09-02'), null);

// --- banner: highlight is the only way in ----------------------------------
//
// The wording still branches on what actually changed, so a highlighted
// cancellation reads as one rather than as a generic notice.

const flag = (entries) => entries.map((e) => ({ ...e, highlight: true }));

check('highlighted cancellation reads as one', firstBanner(PATTERN, flag(off), '2026-09-02'), {
  label: 'V pátek nestreamuju', detail: 'svatba',
});
check('cancelled today reads Dnes', firstBanner(PATTERN, [{ date: '2026-09-02', status: 'off', highlight: true }], '2026-09-02'), {
  label: 'Dnes nestreamuju', detail: undefined,
});
check('cancelled tomorrow reads Zítra', firstBanner(PATTERN, [{ date: '2026-09-05', status: 'off', highlight: true }], '2026-09-04'), {
  label: 'Zítra nestreamuju', detail: undefined,
});
check('wednesday uses "Ve"', firstBanner(PATTERN, [{ date: '2026-09-09', status: 'off', highlight: true }], '2026-09-05'), {
  label: 'Ve středu nestreamuju', detail: undefined,
});
check('highlighted time change reads the new time', firstBanner(PATTERN, flag(later), '2026-09-02'), {
  label: 'V pátek streamuju od 20:00', detail: 'pozdější start',
});
check('highlighted undecided time', firstBanner(PATTERN, flag(unsure), '2026-09-02'), {
  label: 'V pátek streamuju, čas ještě nevím', detail: 'čas dám vědět na Discordu',
});
check('beyond 7 days is silent even highlighted', firstBanner(PATTERN, [{ date: '2026-09-20', status: 'off', highlight: true }], '2026-09-02'), null);
check('past exception is silent even highlighted', firstBanner(PATTERN, flag(off), '2026-09-05'), null);
check('highlighted bonus day banners', firstBanner(PATTERN, [{ ...bonus[0], highlight: true }], '2026-09-02'), {
  label: 'V úterý bonusový stream od 20:00', detail: 'bonus',
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

// --- banner: the game rides along ------------------------------------------
//
// Owner's call 2026-09-17: the banner showed only the note, so on an ordinary
// highlighted evening — a note and a game, nothing else changed — the game
// never reached the top of the page. It now follows as the detail, mirroring
// the calendar row. Nothing is ever printed twice.

const evening = { date: '2026-09-04', highlight: true, note: 'Dohrajeme Wolverina', game: "Marvel's Wolverine" };

check('note leads and the game follows', firstBanner(PATTERN, [evening], '2026-09-02'), {
  label: 'V pátek: Dohrajeme Wolverina', detail: "Marvel's Wolverine",
});
check(
  'the game alone takes the sentence, and does not repeat',
  firstBanner(PATTERN, [{ date: '2026-09-04', highlight: true, game: 'Silent Hill 2' }], '2026-09-02'),
  { label: 'V pátek: Silent Hill 2' },
);
check(
  'a note alone still has no detail',
  firstBanner(PATTERN, [{ date: '2026-09-04', highlight: true, note: 'jen tak' }], '2026-09-02'),
  { label: 'V pátek: jen tak' },
);
// The mechanical cases carry both, note first, in that one line.
check(
  'a moved time lists the reason then the game',
  firstBanner(PATTERN, [{ ...evening, start: '20:00' }], '2026-09-02'),
  { label: 'V pátek streamuju od 20:00', detail: "Dohrajeme Wolverina · Marvel's Wolverine" },
);
check(
  'an undecided time does too',
  firstBanner(PATTERN, [{ ...evening, start: undefined, timeUnknown: true }], '2026-09-02'),
  { label: 'V pátek streamuju, čas ještě nevím', detail: "Dohrajeme Wolverina · Marvel's Wolverine" },
);
// A cancellation deliberately drops the game: there is no stream for it to be
// the game of, and "nestreamuju · svatba · Skyrim" reads as nonsense.
check(
  'a cancellation keeps the reason and drops the game',
  firstBanner(PATTERN, [{ date: '2026-09-04', highlight: true, status: 'off', note: 'svatba', game: 'Skyrim' }], '2026-09-02'),
  { label: 'V pátek nestreamuju', detail: 'svatba' },
);
check(
  'a cancellation with only a game says just the sentence',
  firstBanner(PATTERN, [{ date: '2026-09-04', highlight: true, status: 'off', game: 'Skyrim' }], '2026-09-02'),
  { label: 'V pátek nestreamuju' },
);
// The CMS writes '' for blank fields; an empty game must not leave a trailing
// separator or an empty detail line.
check(
  'empty CMS strings produce no detail',
  firstBanner(PATTERN, [{ date: '2026-09-04', status: '', start: '', game: '', note: '', highlight: true }], '2026-09-02'),
  { label: 'V pátek speciální stream' },
);

// --- banner: picking between several ---------------------------------------
check('banner picks the soonest', firstBanner(PATTERN, [
  { date: '2026-09-07', status: 'off', note: 'pozdější', highlight: true },
  { date: '2026-09-04', status: 'off', note: 'dřívější', highlight: true },
], '2026-09-02'), { label: 'V pátek nestreamuju', detail: 'dřívější' });
check('banner skips unhighlighted entries to find a real one', firstBanner(PATTERN, [
  { date: '2026-09-04', status: 'off', note: 'tichý' },
  { date: '2026-09-06', status: 'off', note: 'volno', highlight: true },
], '2026-09-02'), { label: 'V neděli nestreamuju', detail: 'volno' });

// --- the pattern is bounded, exceptions are not ----------------------------
//
// Owner's call 2026-09-15. Listing the same five evenings weeks ahead says
// nothing, but a stream cancelled in November is worth knowing about in
// September. So `dayCount` bounds the recurring pattern only.

const FAR = '2026-12-24';
const farOff = [{ date: FAR, status: 'off', note: 'Vánoce' }];

check(
  'a far-future exception is listed despite a short window',
  dates('2026-09-02', 7, farOff).includes(FAR),
  true,
);
check(
  'and the pattern is still bounded by the window',
  dates('2026-09-02', 7, farOff).filter((d) => d < '2026-09-09').length,
  dates('2026-09-02', 7).length,
);
check(
  'it sorts to the end, not the front',
  dates('2026-09-02', 7, farOff).at(-1),
  FAR,
);
check(
  'a past exception is still dropped',
  dates('2026-09-02', 7, [{ date: '2026-08-01', status: 'off' }]).includes('2026-08-01'),
  false,
);
// An exception inside the window must not produce the day twice.
check(
  'an in-window exception is not duplicated',
  dates('2026-09-02', 7, [{ date: '2026-09-04', status: 'off' }]).filter((d) => d === '2026-09-04').length,
  1,
);
// A far exception on a weekday the pattern does not cover still shows.
check(
  'a far exception on a free weekday shows',
  dates('2026-09-02', 7, [{ date: '2026-12-01', start: '20:00' }]).includes('2026-12-01'),
  true,
);
check('the far day carries its exception flag', (() => {
  const day = getUpcomingDays(PATTERN, farOff, '2026-09-02', 7).find((d) => d.date === FAR);
  return { isException: day.isException, streaming: day.streaming, note: day.note };
})(), { isException: true, streaming: false, note: 'Vánoce' });

// The banner must NOT follow the exceptions out — it is the next week only,
// and `dayCount` alone no longer expresses that.
check(
  'a far highlighted exception never banners',
  getBanners(PATTERN, [{ date: FAR, status: 'off', highlight: true }], '2026-09-02'),
  [],
);
check(
  'but one inside the week still does',
  getBanners(PATTERN, [{ date: '2026-09-06', status: 'off', highlight: true }], '2026-09-02')
    .map((b) => b.label),
  ['V neděli nestreamuju'],
);
// The edge: the seventh day out is in, the eighth is not.
check(
  'the last day of the week is in',
  getBanners(PATTERN, [{ date: '2026-09-08', highlight: true }], '2026-09-02').length,
  1,
);
check(
  'the day after is not',
  getBanners(PATTERN, [{ date: '2026-09-09', highlight: true }], '2026-09-02').length,
  0,
);

// --- a recurring day can carry a name --------------------------------------
//
// Added 2026-09-14 so Monday can read "Co-Op s Terousch" instead of the
// generic "Stream". A pattern day is either a bare time or {start, game}, and
// both forms have to behave identically apart from the name.

const NAMED = { ...PATTERN, mon: { start: '19:00', game: 'Co-Op s Terousch' } };
const namedDay = (date, exceptions = NONE) =>
  getUpcomingDays(NAMED, exceptions, '2026-09-02', 14).find((d) => d.date === date);

check('the object form still sets the time', namedDay('2026-09-07').start, '19:00');
check('and carries its name', namedDay('2026-09-07').game, 'Co-Op s Terousch');
check('the string form still works', namedDay('2026-09-09').start, '18:30');
check('and has no name', namedDay('2026-09-09').game, undefined);
check('a named day is not an exception', namedDay('2026-09-07').isException, false);
check('nor a time change', namedDay('2026-09-07').timeChanged, false);
check('nor an added day', namedDay('2026-09-07').added, false);

// An exception's own game still wins — that is how a one-off swap works.
check(
  'an exception game overrides the pattern name',
  namedDay('2026-09-07', [{ date: '2026-09-07', game: 'Silent Hill 2' }]).game,
  'Silent Hill 2',
);
// ...but the CMS writes '' for a field left blank, and that must not erase it.
check(
  'an empty exception game falls back to the pattern name',
  namedDay('2026-09-07', [{ date: '2026-09-07', status: '', game: '', note: 'jen poznámka' }]).game,
  'Co-Op s Terousch',
);
// A time moved off the named day's own time is still a change.
check(
  'a moved time is measured against the object form',
  namedDay('2026-09-07', [{ date: '2026-09-07', start: '21:00' }]).timeChanged,
  true,
);
check(
  'and the same time is not',
  namedDay('2026-09-07', [{ date: '2026-09-07', start: '19:00' }]).timeChanged,
  false,
);
// Cancelling a named day still hides the time and keeps the name off the row's
// headline — the row prints "Nestreamuju" regardless.
check('a named day can still be cancelled', namedDay('2026-09-07', [{ date: '2026-09-07', status: 'off' }]).streaming, false);
// The name alone must not put anything in the banner.
check('a named pattern day never banners', getBanners(NAMED, NONE, '2026-09-02'), []);

// --- timezone --------------------------------------------------------------
check('todayIn returns ISO date', /^\d{4}-\d{2}-\d{2}$/.test(todayIn('Europe/Prague')), true);


// --- several banners at once -----------------------------------------------
const busyWeek = [
  { date: '2026-09-04', status: 'off', note: 'svatba', highlight: true },
  { date: '2026-09-05', start: '21:00', highlight: true },
  { date: '2026-09-07', timeUnknown: true, highlight: true },
];
check('highlighted changes become banners, soonest first', getBanners(PATTERN, busyWeek, '2026-09-02').map((b) => b.label), [
  'V pátek nestreamuju',
  'V sobotu streamuju od 21:00',
  'V pondělí streamuju, čas ještě nevím',
]);
// The same week with the boxes unticked: the calendar still shows all three,
// the banner shows none. This is the whole point of the 2026-09-14 change.
check('the same week unhighlighted is silent', getBanners(PATTERN, busyWeek.map(({ highlight, ...rest }) => rest), '2026-09-02'), []);
check('quiet entries never become banners', getBanners(PATTERN, [
  { date: '2026-09-04', game: 'hra' },
  { date: '2026-09-05', note: 'poznámka' },
], '2026-09-02'), []);
check('banner list is empty without exceptions', getBanners(PATTERN, NONE, '2026-09-02'), []);

// --- duplicate dates -------------------------------------------------------
const dupes = [
  { date: '2026-09-04', status: 'off', highlight: true },
  { date: '2026-09-04', note: 'svatba' },
];
const dupResult = mergeExceptions(dupes);
check('duplicates collapse to one entry', dupResult.merged.length, 1);
check('duplicates are reported', dupResult.duplicates, [{ date: '2026-09-04', count: 2 }]);
check('merged entry keeps both fields', dupResult.merged[0], {
  date: '2026-09-04', status: 'off', highlight: true, note: 'svatba',
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
check(
  'duplicate date yields one banner',
  getBanners(PATTERN, dupes, '2026-09-02').map((b) => ({ label: b.label, detail: b.detail })),
  [{ label: 'V pátek nestreamuju', detail: 'svatba' }],
);
// The old behaviour kept only the first entry, which could drop a cancellation.
check('cancellation survives being second', getBanners(PATTERN, [
  { date: '2026-09-04', game: 'hra' },
  { date: '2026-09-04', status: 'off', highlight: true },
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

// The whole week as it renders from that real data. Only the middle entry has
// the box ticked, and since 2026-09-14 that is the only one that banners — the
// moved time and the cancellation stay on the calendar alone.
check('real CMS data banners only the highlighted one', getBanners(PATTERN, fromCms, '2026-09-02').map((b) => b.label), [
  'Zítra bonusový stream od 18:30',
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

// --- the pieces the banner is re-labelled from ----------------------------
// The banner sits on every page, so a stale build announcing "Dnes
// nestreamuju" about yesterday is the most visible way this could go wrong.
// It therefore ships the day word separately from the sentence.
const offFriday = firstBannerRaw(PATTERN, [{ date: '2026-09-04', status: 'off', highlight: true }], '2026-09-02');
check('a banner carries the day it is about', offFriday.date, '2026-09-04');
check('the day word is separate', offFriday.when, 'V pátek');
check('and the rest keeps its leading space', offFriday.rest, ' nestreamuju');
check('label is exactly the two joined', offFriday.label, offFriday.when + offFriday.rest);

// Swapping the day word must produce the sentence the build would have made
// on that day. Built on the 2nd it reads "V pátek"; the same stored record
// must sharpen to "Zítra" and then "Dnes" as the day approaches.
check(
  'read on the 3rd, the same record reads "Zítra"',
  dayReferenceFor('2026-09-04', '2026-09-03') + offFriday.rest,
  'Zítra nestreamuju',
);
check(
  'and on the day itself, "Dnes"',
  dayReferenceFor('2026-09-04', '2026-09-04') + offFriday.rest,
  'Dnes nestreamuju',
);
// Two or more days out it falls back to the weekday, which is what the build
// itself produced.
check(
  'and two days out it is the weekday again',
  dayReferenceFor('2026-09-04', '2026-09-02') + offFriday.rest,
  offFriday.label,
);

// The colon form has no leading space, so joining must not introduce one.
const editorial = firstBannerRaw(
  PATTERN,
  [{ date: '2026-09-05', highlight: true, note: 'program se přesouvá' }],
  '2026-09-02',
);
check('the colon form starts with the colon', editorial.rest, ': program se přesouvá');
check('and joins without a stray space', editorial.label, 'V sobotu: program se přesouvá');
// That note is already the whole message, so repeating it as a detail would
// print it twice in the ticker.
check('an editorial banner carries no duplicate detail', editorial.detail, undefined);

check('dayReferenceFor: today', dayReferenceFor('2026-09-04', '2026-09-04'), 'Dnes');
check('dayReferenceFor: tomorrow', dayReferenceFor('2026-09-05', '2026-09-04'), 'Zítra');
check('dayReferenceFor: Wednesday takes "Ve"', dayReferenceFor('2026-09-09', '2026-09-05'), 'Ve středu');
check('dayReferenceFor: a past day still names its weekday', dayReferenceFor('2026-09-02', '2026-09-04'), 'Ve středu');

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
