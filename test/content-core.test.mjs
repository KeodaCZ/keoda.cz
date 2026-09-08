/**
 * Checks for the content archive helpers. Run: npm test
 *
 * The one with teeth is curate(): hidden.json is how the owner takes something
 * off the site, and featured.json carries an ordering that is the only thing it
 * says. Getting either wrong is silent — nobody notices a video that should
 * have been hidden but wasn't.
 */
import {
  cleanTitle,
  curate,
  formatDate,
  formatDuration,
  groupByMonth,
  monthKey,
  monthName,
} from '../src/lib/content-core.ts';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

// --- formatDuration -------------------------------------------------------
// Real values from the archive: a 32s Short, a 165s Short, a 4h35 stream.
check('a short clip', formatDuration(32), '0:32');
check('under a minute pads the seconds', formatDuration(5), '0:05');
check('a long Short', formatDuration(165), '2:45');
check('exactly a minute', formatDuration(60), '1:00');
check('just under an hour', formatDuration(3599), '59:59');
check('exactly an hour pads the minutes', formatDuration(3600), '1:00:00');
check('a median stream', formatDuration(16512), '4:35:12');
check('the longest stream in the archive', formatDuration(42900), '11:55:00');
// Nothing printable rather than "0:00" or "NaN:aN" — the caller can then skip it.
check('zero is empty', formatDuration(0), '');
check('missing is empty', formatDuration(undefined), '');
check('nonsense is empty', formatDuration(NaN), '');
check('negative is empty', formatDuration(-5), '');
check('fractional clip lengths round', formatDuration(30.6), '0:31');

// --- formatDate -----------------------------------------------------------
check('czech date, no leading zeros', formatDate('2026-09-06T19:22:19Z'), '6. 9. 2026');
check('two-digit day and month', formatDate('2026-12-31T00:00:00Z'), '31. 12. 2026');
// The archive spans 2023 to now, so the year is never dropped.
check('an old item keeps its year', formatDate('2023-07-03T18:00:00Z'), '3. 7. 2023');
check('a broken date is empty, not "NaN. NaN."', formatDate('nesmysl'), '');
check('missing is empty', formatDate(undefined), '');

// --- month grouping -------------------------------------------------------
check('month name', monthName('2026-09-06T19:00:00Z'), 'září 2026');
check('january', monthName('2026-01-06T19:00:00Z'), 'leden 2026');
check('december', monthName('2026-12-06T19:00:00Z'), 'prosinec 2026');
check('key sorts like the date does', monthKey('2026-09-06T19:00:00Z'), '2026-09');

const items = [
  { id: 'a', date: '2026-09-06T19:00:00Z' },
  { id: 'b', date: '2026-09-01T19:00:00Z' },
  { id: 'c', date: '2026-08-30T19:00:00Z' },
  { id: 'd', date: '2026-06-01T19:00:00Z' },
];
check(
  'consecutive months become blocks, order kept',
  groupByMonth(items).map((g) => `${g.label}: ${g.items.map((i) => i.id).join(',')}`),
  ['září 2026: a,b', 'srpen 2026: c', 'červen 2026: d'],
);
check('an empty list yields no groups', groupByMonth([]), []);
// The stream archive has no 2024 at all, so a gap must not merge two blocks.
check(
  'a gap year does not merge the months either side',
  groupByMonth([
    { id: 'x', date: '2025-01-05T19:00:00Z' },
    { id: 'y', date: '2023-12-20T19:00:00Z' },
  ]).map((g) => g.label),
  ['leden 2025', 'prosinec 2023'],
);
// Same month in different years must never share a block.
check(
  'september 2026 and september 2025 stay apart',
  groupByMonth([
    { id: 'p', date: '2026-09-01T19:00:00Z' },
    { id: 'q', date: '2025-09-01T19:00:00Z' },
  ]).map((g) => g.items.length),
  [1, 1],
);

// --- curate ---------------------------------------------------------------
const all = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
const ids = (list) => list.map((i) => i.id);

check('untouched without curation files', ids(curate(all)), ['1', '2', '3', '4']);
check('hidden is dropped', ids(curate(all, ['2'])), ['1', '3', '4']);
check('several hidden', ids(curate(all, ['1', '4'])), ['2', '3']);
check('featured moves to the front', ids(curate(all, [], ['3'])), ['3', '1', '2', '4']);

// featured.json's order is the owner's ranking, and re-sorting it would throw
// away the only information the file carries.
check('featured keeps the order it is listed in', ids(curate(all, [], ['4', '2'])), ['4', '2', '1', '3']);
check('and that order is not the natural one', ids(curate(all, [], ['3', '1'])), ['3', '1', '2', '4']);

// hidden wins: it is how something comes off the site, so a stale pin must not
// drag it back.
check('hidden beats featured', ids(curate(all, ['3'], ['3'])), ['1', '2', '4']);
check('hidden beats featured, others still pinned', ids(curate(all, ['3'], ['3', '2'])), ['2', '1', '4']);

// An id can outlive the thing it points at — a video deleted on YouTube months
// after someone pinned it must not break the build.
check('an unknown featured id is ignored', ids(curate(all, [], ['nope', '2'])), ['2', '1', '3', '4']);
check('an unknown hidden id is ignored', ids(curate(all, ['nope'])), ['1', '2', '3', '4']);
check('curating an empty list is empty', ids(curate([], ['a'], ['b'])), []);
check('everything hidden leaves nothing', ids(curate(all, ['1', '2', '3', '4'])), []);

// Must not mutate the caller's array — pages reuse the same imported data.
const source = [{ id: '1' }, { id: '2' }];
const before = JSON.stringify(source);
curate(source, [], ['2']);
check('the input list is left alone', JSON.stringify(source), before);

// --- cleanTitle -----------------------------------------------------------
// Every example here is a real title from the archive. The risk is the same as
// with clip labels but inverted: a stream title *is* the content, so removing
// too much destroys the only description the row has.
check(
  'the common shape',
  cleanTitle('🔴 Vybereme MC RPG modpack a následně DbD nebo Minecraft 🔴 !dc !ig !clip'),
  'Vybereme MC RPG modpack a následně DbD nebo Minecraft',
);
check('a short one', cleanTitle('🔴 Chill v DbD 🔴 !dc !ig !clip'), 'Chill v DbD');
check(
  'a pipe inside the title is not a dangling separator',
  cleanTitle('🔴 Dohráli jsme Subnauticu a rozehráváme nekonečnou serii v MC | GT New Horizons 🔴 !dc !ig !clip'),
  'Dohráli jsme Subnauticu a rozehráváme nekonečnou serii v MC | GT New Horizons',
);
check(
  'a trailing pipe left by the stripping does go',
  cleanTitle('Killer řádí všude | 🔴 !dc !ig !clip'),
  'Killer řádí všude',
);
check('commands without the emoji', cleanTitle('Chill v DbD !dc !ig !clip'), 'Chill v DbD');
check('a single command', cleanTitle('Dneska Skyrim !clip'), 'Dneska Skyrim');

// Titles that must come through untouched.
check('a clean title is unchanged', cleanTitle('Pikantní kuřecí kousky na medu | Vaříme s Keodou 1'), 'Pikantní kuřecí kousky na medu | Vaříme s Keodou 1');
check('a Short title is unchanged', cleanTitle('Točíme kolečka v Dead by Daylight'), 'Točíme kolečka v Dead by Daylight');
// His own emoji are his voice, not furniture — only the live marker goes.
check('other emoji survive', cleanTitle('Hra která mě vůbec neštve 😭😭😭'), 'Hra která mě vůbec neštve 😭😭😭');
check('an exclamation is not a command', cleanTitle('to bylo těsný!'), 'to bylo těsný!');
check('shouting mid-sentence survives', cleanTitle('no ne! zase'), 'no ne! zase');
check(
  'a real one with a question mark',
  cleanTitle('🔴 Po delší době Skyrim | Kde jsem skončil? Nevím 🔴 !dc !ig !clip'),
  'Po delší době Skyrim | Kde jsem skončil? Nevím',
);

// Never leave a row with no title at all.
check('a title that is only furniture falls back', cleanTitle('🔴 !dc !ig !clip'), '🔴 !dc !ig !clip');
check('empty stays empty', cleanTitle(''), '');
check('missing stays empty', cleanTitle(undefined), '');
check('whitespace collapses', cleanTitle('  Chill   v    DbD  '), 'Chill v DbD');

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} content checks passed.`);
