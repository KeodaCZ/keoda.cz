/**
 * Checks for the archive filter. Run: npm test
 *
 * This logic runs entirely in the visitor's browser, where nothing watches it.
 * The failures worth pinning down are the quiet ones: a search that misses
 * because of an accent, a date range that drops its own endpoints, and a page
 * number out of a pasted URL that lands on an empty grid looking like a broken
 * site.
 */
import {
  DEFAULT_STATE,
  clampPage,
  countLabel,
  isDefault,
  matches,
  pageCount,
  pageSlice,
  searchKey,
  selectItems,
  sortItems,
  stateFromParams,
  stateToParams,
  withinRange,
} from '../src/lib/archive-filter.ts';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const state = (over = {}) => ({ ...DEFAULT_STATE, ...over });

// --- searchKey ------------------------------------------------------------

check('diacritics come off', searchKey('Záznam Skyrimu'), 'zaznam skyrimu');
check('case comes down', searchKey('DbD CHILL'), 'dbd chill');
check('whitespace collapses', searchKey('  a   b  '), 'a b');
check('undefined is empty, not a crash', searchKey(undefined), '');
check('ř ě š č ž ý á í é ú ů all reduce', searchKey('Řeřicha ě š č ž ý á í é ú ů'), 'rericha e s c z y a i e u u');
// Emoji are not diacritics and must survive — they are his own voice, and
// cleanTitle deliberately keeps everything but 🔴.
check('emoji survive', searchKey('item 👀'), 'item 👀');

// --- matches --------------------------------------------------------------

const chill = searchKey('Chill v DbD');
check('a word matches', matches(chill, 'dbd'), true);
check('accent-free input finds an accented title', matches(searchKey('Záznam'), 'zaznam'), true);
check('and the reverse also works', matches(searchKey('Zaznam'), 'záznam'), true);
check('words may be out of order', matches(chill, 'dbd chill'), true);
check('all words must appear', matches(chill, 'dbd skyrim'), false);
check('an empty query matches everything', matches(chill, ''), true);
check('whitespace-only is an empty query', matches(chill, '   '), true);
check('a substring inside a word counts', matches(chill, 'hil'), true);

// --- withinRange ----------------------------------------------------------
//
// Inclusive at both ends: a range typed as 2.3. to 10.3. must contain both
// those days, or picking a single day would return nothing.

check('both bounds are inclusive', withinRange('2026-03-02T10:00:00Z', '2026-03-02', '2026-03-10'), true);
check('the far end too', withinRange('2026-03-10T23:59:00Z', '2026-03-02', '2026-03-10'), true);
check('one day before is out', withinRange('2026-03-01T10:00:00Z', '2026-03-02', '2026-03-10'), false);
check('one day after is out', withinRange('2026-03-11T00:00:00Z', '2026-03-02', '2026-03-10'), false);
check('a single-day range works', withinRange('2026-03-05T12:00:00Z', '2026-03-05', '2026-03-05'), true);
check('an open start', withinRange('2020-01-01T00:00:00Z', '', '2026-03-10'), true);
check('an open end', withinRange('2030-01-01T00:00:00Z', '2026-03-02', ''), true);
check('both open', withinRange('2026-03-05T00:00:00Z', '', ''), true);
check('an item with no date is excluded, not included by accident', withinRange('', '', ''), false);

// --- isDefault ------------------------------------------------------------

check('the default state is default', isDefault(DEFAULT_STATE), true);
check('a page number alone does not make it non-default', isDefault(state({ page: 4 })), true);
check('a query does', isDefault(state({ q: 'x' })), false);
check('whitespace does not', isDefault(state({ q: '  ' })), true);
check('a sort does', isDefault(state({ order: 'nejstarsi' })), false);
check('re-picking the default sort does not', isDefault(state({ order: 'nejnovejsi' })), true);
check('a kind does', isDefault(state({ kind: 'shorts' })), false);
check('a date does', isDefault(state({ from: '2026-01-01' })), false);

// --- sortItems ------------------------------------------------------------

const items = [
  { key: 'stary', date: '2023-05-01T10:00:00Z', views: 100 },
  { key: 'novy', date: '2026-09-01T10:00:00Z', views: 5 },
  { key: 'prostredni', date: '2025-01-01T10:00:00Z', views: 50 },
];
const keys = (list) => list.map((i) => i.key);

check('newest first is the default', keys(sortItems(items, 'nejnovejsi')), ['novy', 'prostredni', 'stary']);
check('oldest first reverses it', keys(sortItems(items, 'nejstarsi')), ['stary', 'prostredni', 'novy']);
check('most viewed ignores the date', keys(sortItems(items, 'nejsledovanejsi')), ['stary', 'prostredni', 'novy']);
check('the input is not mutated', keys(items), ['stary', 'novy', 'prostredni']);

// A clip with no count must not outrank one with zero views, and must not
// clump at the front — sorting an archive that is only partly populated has to
// still look deliberate.
const mixed = [
  { key: 'zadne', date: '2026-01-01T00:00:00Z' },
  { key: 'nula', date: '2025-01-01T00:00:00Z', views: 0 },
  { key: 'deset', date: '2024-01-01T00:00:00Z', views: 10 },
];
check('unknown counts sort last', keys(sortItems(mixed, 'nejsledovanejsi')), ['deset', 'nula', 'zadne']);

// Equal counts fall back to the date, so the order is stable and meaningful
// rather than whatever the input happened to be.
const tied = [
  { key: 'a', date: '2024-01-01T00:00:00Z', views: 7 },
  { key: 'b', date: '2026-01-01T00:00:00Z', views: 7 },
];
check('ties break on the date, newest first', keys(sortItems(tied, 'nejsledovanejsi')), ['b', 'a']);

// --- selectItems ----------------------------------------------------------

const pool = [
  { key: searchKey('Chill v DbD'), date: '2026-09-06T10:00:00Z', views: 3, kind: 'videa' },
  { key: searchKey('Po delší době Skyrim'), date: '2026-03-05T10:00:00Z', views: 90, kind: 'videa' },
  { key: searchKey('Skyrim znovu'), date: '2025-03-05T10:00:00Z', views: 40, kind: 'shorts' },
];

check('an empty state keeps everything', selectItems(pool, DEFAULT_STATE).length, 3);
check(
  'a query narrows it, accent-free',
  selectItems(pool, state({ q: 'delsi dobe' })).map((i) => i.date.slice(0, 10)),
  ['2026-03-05'],
);
check('a kind narrows it', selectItems(pool, state({ kind: 'shorts' })).length, 1);
check(
  'a date range narrows it',
  selectItems(pool, state({ from: '2026-01-01', to: '2026-12-31' })).length,
  2,
);
check(
  'filters combine, they do not replace each other',
  selectItems(pool, state({ q: 'skyrim', from: '2026-01-01', to: '2026-12-31' })).length,
  1,
);
check(
  'and the result is sorted by the chosen order',
  selectItems(pool, state({ q: 'skyrim', order: 'nejstarsi' })).map((i) => i.date.slice(0, 10)),
  ['2025-03-05', '2026-03-05'],
);
check('a query that matches nothing returns nothing', selectItems(pool, state({ q: 'fortnite' })), []);

// --- paging ---------------------------------------------------------------

check('471 items at 48 a page is 10 pages', pageCount(471, 48), 10);
check('an exact multiple does not gain a blank page', pageCount(96, 48), 2);
check('no items is still one page, not zero', pageCount(0, 48), 1);
check('size 0 means no paging at all', pageCount(471, 0), 1);

check('a page below the first is clamped up', clampPage(0, 471, 48), 1);
check('a page past the last is clamped down', clampPage(99, 471, 48), 10);
check('nonsense out of a URL lands on page 1', clampPage(NaN, 471, 48), 1);
check('an empty result set clamps to page 1', clampPage(5, 0, 48), 1);

const fifty = Array.from({ length: 50 }, (_, i) => ({ key: String(i), date: '2026-01-01' }));
check('page 1 is the first slice', pageSlice(fifty, 1, 48).length, 48);
check('page 2 is the remainder', pageSlice(fifty, 2, 48).length, 2);
check('a page past the end shows the last one, not nothing', pageSlice(fifty, 9, 48).length, 2);
check('size 0 returns the lot', pageSlice(fifty, 1, 0).length, 50);

// --- URL round trip -------------------------------------------------------

const full = state({ q: 'skyrim', from: '2026-01-01', to: '2026-03-01', order: 'nejstarsi', kind: 'shorts', page: 3 });
check(
  'the URL carries only what differs from the default',
  stateToParams(full).toString(),
  'q=skyrim&od=2026-01-01&do=2026-03-01&typ=shorts&razeni=nejstarsi&strana=3',
);
check('the default state produces a clean URL', stateToParams(DEFAULT_STATE).toString(), '');
check(
  'a page number is not written while nothing is filtered',
  stateToParams(state({ page: 5 })).toString(),
  '',
);

const round = stateFromParams(stateToParams(full), ['videa', 'shorts']);
check('and it round-trips', round, full);

check(
  'a bad date is dropped rather than filtering to nothing',
  stateFromParams(new URLSearchParams('od=vcera')).from,
  '',
);
check(
  'a bad sort falls back to the default',
  stateFromParams(new URLSearchParams('razeni=nahodne')).order,
  DEFAULT_STATE.order,
);
check(
  'an unknown kind is dropped, since only the page knows its kinds',
  stateFromParams(new URLSearchParams('typ=podcast'), ['videa', 'shorts']).kind,
  '',
);
check(
  'a kind the page does declare is kept',
  stateFromParams(new URLSearchParams('typ=shorts'), ['videa', 'shorts']).kind,
  'shorts',
);
check('a bad page number becomes 1', stateFromParams(new URLSearchParams('strana=0')).page, 1);
check('an empty URL is the default state', stateFromParams(new URLSearchParams()), DEFAULT_STATE);

// --- Czech plurals --------------------------------------------------------
//
// Three forms, and getting it wrong shows up on every single search.
const clips = ['klip', 'klipy', 'klipů'];
check('1', countLabel(1, clips), '1 klip');
check('2', countLabel(2, clips), '2 klipy');
check('4', countLabel(4, clips), '4 klipy');
check('5', countLabel(5, clips), '5 klipů');
check('0', countLabel(0, clips), '0 klipů');
check('11', countLabel(11, clips), '11 klipů');
check('471', countLabel(471, clips), '471 klipů');

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} archive-filter checks passed.`);
