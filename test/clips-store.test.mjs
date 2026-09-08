/**
 * Checks for the clip archive logic. Run: npm test
 *
 * This is the code that can lose the archive, and it runs unattended every six
 * hours against an API that only ever shows a window of the history. So the
 * tests here are mostly about what must NOT happen: nothing dropped, nothing
 * silently rewritten, and a mass disappearance treated as a broken API rather
 * than as news.
 */
import {
  mergeClips,
  applyRemovals,
  looksLikeApiFailure,
  yearOf,
} from '../scripts/lib/clips-store.mjs';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const clip = (id, createdAt, extra = {}) => ({
  id,
  title: `titulek ${id}`,
  createdAt,
  game: 'Dead by Daylight',
  creator: 'nekdo',
  duration: 30,
  ...extra,
});

const ids = (byYear) =>
  Object.fromEntries(
    Object.entries(byYear).map(([year, file]) => [year, file.clips.map((c) => c.id)]),
  );

// --- yearOf ---------------------------------------------------------------
check('year comes from the clip, not from today', yearOf(clip('a', '2025-03-04T10:00:00Z')), '2025');

// --- merge adds ------------------------------------------------------------
const empty = {};
const first = mergeClips(empty, [clip('a', '2026-09-01T10:00:00Z')]);
check('first clip lands in its year', ids(first.byYear), { 2026: ['a'] });
check('and is reported as added', first.added.length, 1);

check(
  'clips split across year files',
  ids(mergeClips(empty, [clip('a', '2025-12-31T23:00:00Z'), clip('b', '2026-01-01T01:00:00Z')]).byYear),
  { 2025: ['a'], 2026: ['b'] },
);

// --- merge never drops ----------------------------------------------------
// The whole point: a fetch window that no longer contains an old clip must not
// remove it. This is the failure that overwrite-style code causes.
const archive = {
  2026: { clips: [clip('old', '2026-01-01T10:00:00Z'), clip('mid', '2026-05-01T10:00:00Z')] },
};
const narrow = mergeClips(archive, [clip('new', '2026-09-01T10:00:00Z')]);
check('a narrow window keeps everything outside it', ids(narrow.byYear), {
  2026: ['new', 'mid', 'old'],
});
check('nothing counted as added but the new one', narrow.added.map((c) => c.id), ['new']);

check(
  'an empty fetch changes nothing',
  ids(mergeClips(archive, []).byYear),
  { 2026: ['mid', 'old'] },
);

// --- identity is the id, never the title or the date ----------------------
// The window is 90 days wide and runs every six hours, so almost everything it
// returns is already stored. Identity therefore has to be exact, and Twitch's
// clip id is the only field that is: two clips from one stream routinely share
// a title and a timestamp, because Twitch copies the stream's title in when the
// clipper types nothing.
const sameSecond = [
  { ...clip('id-one', '2026-09-01T20:11:07Z'), title: '🔴 Dead by Daylight 🔴 !dc !ig !clip' },
  { ...clip('id-two', '2026-09-01T20:11:07Z'), title: '🔴 Dead by Daylight 🔴 !dc !ig !clip' },
];
const twins = mergeClips(empty, sameSecond);
check('same title, same second, different ids — both kept', twins.added.length, 2);
check('and both are in the archive', ids(twins.byYear), { 2026: ['id-one', 'id-two'] });

// Re-fetching the identical window must be a no-op, however many times it runs.
const again = mergeClips(twins.byYear, sameSecond);
check('re-fetching the same window adds nothing', again.added, []);
check('and updates nothing', again.updated, []);
const third = mergeClips(again.byYear, sameSecond);
check('a third pass is still a no-op', ids(third.byYear), { 2026: ['id-one', 'id-two'] });

// The reverse: one clip whose title and date both changed is still that clip.
const edited = mergeClips(twins.byYear, [
  { ...clip('id-one', '2020-01-01T00:00:00Z'), title: 'přepsaný titulek' },
]);
check('a changed title does not create a second record', edited.added, []);
check(
  'and a changed date does not move it to another year — createdAt is written once',
  ids(edited.byYear),
  { 2026: ['id-one', 'id-two'] },
);

// --- merge does not churn -------------------------------------------------
const same = mergeClips(archive, [clip('old', '2026-01-01T10:00:00Z')]);
check('re-fetching an unchanged clip reports no update', same.updated, []);
check('and adds nothing', same.added, []);

// A view count must never reach the archive: at four fetches a day it would
// rewrite the whole file daily and bury real changes in the git history.
const withViews = mergeClips(empty, [clip('a', '2026-09-01T10:00:00Z', { views: 999 })]);
check('view counts are not a tracked field', withViews.updated, []);
const bumped = mergeClips(withViews.byYear, [clip('a', '2026-09-01T10:00:00Z', { views: 12345 })]);
check('so a changed view count is not an update either', bumped.updated, []);

// --- merge updates what can really change ---------------------------------
const retitled = mergeClips(archive, [clip('old', '2026-01-01T10:00:00Z', { title: 'nový titulek' })]);
check('an edited title is picked up', retitled.updated, ['old']);
check(
  'and actually written',
  retitled.byYear['2026'].clips.find((c) => c.id === 'old').title,
  'nový titulek',
);

const featured = mergeClips(archive, [clip('mid', '2026-05-01T10:00:00Z', { featured: true })]);
check('featured flips', featured.byYear['2026'].clips.find((c) => c.id === 'mid').featured, true);

// An absent field must not erase a stored one — a sparse API answer is not a
// statement that the value is gone.
const sparse = mergeClips(archive, [{ id: 'old', createdAt: '2026-01-01T10:00:00Z' }]);
check(
  'a missing field does not wipe the stored one',
  sparse.byYear['2026'].clips.find((c) => c.id === 'old').title,
  'titulek old',
);

// --- merge does not mutate its input --------------------------------------
const original = { 2026: { clips: [clip('a', '2026-01-01T10:00:00Z')] } };
const snapshot = JSON.stringify(original);
mergeClips(original, [clip('a', '2026-01-01T10:00:00Z', { title: 'jiný' }), clip('b', '2026-02-01T10:00:00Z')]);
check('the caller\'s archive is left untouched', JSON.stringify(original), snapshot);

// --- merge restores a clip that came back ---------------------------------
const hadRemoved = { 2026: { clips: [clip('a', '2026-01-01T10:00:00Z', { removed: true })] } };
const back = mergeClips(hadRemoved, [clip('a', '2026-01-01T10:00:00Z')]);
check('seeing a clip again lifts its removal', back.restored, ['a']);
check(
  'and the flag is gone, not set to false',
  'removed' in back.byYear['2026'].clips[0],
  false,
);

// --- ordering -------------------------------------------------------------
check(
  'newest first within a year',
  ids(
    mergeClips(empty, [
      clip('b', '2026-05-01T10:00:00Z'),
      clip('c', '2026-09-01T10:00:00Z'),
      clip('a', '2026-01-01T10:00:00Z'),
    ]).byYear,
  ),
  { 2026: ['c', 'b', 'a'] },
);

// --- removals -------------------------------------------------------------
const three = {
  2026: {
    clips: [
      clip('a', '2026-01-01T10:00:00Z'),
      clip('b', '2026-02-01T10:00:00Z'),
      clip('c', '2026-03-01T10:00:00Z'),
    ],
  },
};
const gone = applyRemovals(three, new Set(['a', 'b']), ['a', 'b', 'c']);
check('a missing clip is flagged', gone.newlyRemoved, ['c']);
check('but the record survives', ids(gone.byYear), { 2026: ['c', 'b', 'a'] });
check(
  'soft delete really is a flag',
  gone.byYear['2026'].clips.find((c) => c.id === 'c').removed,
  true,
);

// A clip the run never asked about must not be judged. Batching is capped at
// 100 ids per request, so a partial pass is normal, not evidence of deletion.
const partial = applyRemovals(three, new Set(['a']), ['a']);
check('unchecked clips are left alone', partial.newlyRemoved, []);
check('and do not count toward the ratio', partial.missingRatio, 0);

const returned = applyRemovals(
  { 2026: { clips: [clip('a', '2026-01-01T10:00:00Z', { removed: true })] } },
  new Set(['a']),
  ['a'],
);
check('a clip that reappears is unmarked', returned.restored, ['a']);

// --- the safety valve -----------------------------------------------------
const many = {
  2026: { clips: Array.from({ length: 10 }, (_, i) => clip(`c${i}`, '2026-01-01T10:00:00Z')) },
};
const allIds = many[2026].clips.map((c) => c.id);
const oneGone = applyRemovals(many, new Set(allIds.slice(1)), allIds);
check('one of ten missing is 10%', Math.round(oneGone.missingRatio * 100), 10);
check('which is not a failure', looksLikeApiFailure(oneGone), false);

const halfGone = applyRemovals(many, new Set(allIds.slice(5)), allIds);
check('half missing is 50%', Math.round(halfGone.missingRatio * 100), 50);
check('which is a failure', looksLikeApiFailure(halfGone), true);

const allGone = applyRemovals(many, new Set(), allIds);
check('an empty answer is a failure, not mass deletion', looksLikeApiFailure(allGone), true);

// Already-removed clips must not drag the ratio up forever, or the valve would
// jam shut once enough clips had legitimately gone.
const mostlyRemoved = {
  2026: {
    clips: [
      ...Array.from({ length: 8 }, (_, i) => clip(`old${i}`, '2026-01-01T10:00:00Z', { removed: true })),
      clip('live1', '2026-02-01T10:00:00Z'),
      clip('live2', '2026-02-02T10:00:00Z'),
    ],
  },
};
const stillFine = applyRemovals(
  mostlyRemoved,
  new Set(['live1', 'live2']),
  mostlyRemoved[2026].clips.map((c) => c.id),
);
check('long-gone clips do not count as newly missing', stillFine.newlyRemoved, []);
check('so the valve stays open', looksLikeApiFailure(stillFine), false);

// An empty archive must not read as "everything vanished".
check('an empty archive is not a failure', looksLikeApiFailure(applyRemovals({}, new Set(), [])), false);

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} clip-archive checks passed.`);
