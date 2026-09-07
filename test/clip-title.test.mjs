/**
 * Checks for the clip label rule. Run: npm test
 *
 * The risk here is not missing a bad title — it is throwing away a good one.
 * A false positive silently replaces something the owner wrote with a generic
 * "game · date", and nobody would notice which titles went missing. So the
 * tests lean on real examples from data/clips, and on the near-misses.
 */
import { isStreamTitle, clipLabel } from '../src/lib/clip-title.ts';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

const DBD = 'Dead by Daylight';

// --- real stream titles that leaked in ------------------------------------
check('the exact case from the archive', isStreamTitle('🔴 Dead by Daylight 🔴 !dc !ig !clip', DBD), true);
check('another real one', isStreamTitle('🔴 Náhradní stream s Terousch za pondělí 🔴 !dc !ig !clip'), true);
check('a long real one', isStreamTitle('🔴 Dohráli jsme Subnauticu a rozehráváme nekonečnou serii v MC | GT New Horizons 🔴 !dc !ig !clip'), true);
check('commands with no emoji', isStreamTitle('Chill v DbD !dc !ig !clip'), true);
check('a single command is enough', isStreamTitle('něco !clip'), true);
check('the emoji alone is enough', isStreamTitle('🔴 Chill v DbD'), true);

// --- real clip titles that must survive -----------------------------------
check('a real clip title from the archive', isStreamTitle('Kolo kolo mlýnský', DBD), false);
check('another real one', isStreamTitle('Bing-Bong Keoda. XD', DBD), false);
check('a terse but genuine one', isStreamTitle('item 👀', DBD), false);
// The command test must key on "!word", not on any exclamation mark.
check('a title that merely shouts', isStreamTitle('to bylo těsný!', DBD), false);
check('shouting mid-sentence', isStreamTitle('no ne! zase', DBD), false);
check('an emoji that is not the stream marker', isStreamTitle('😂😂 co to bylo', DBD), false);

// --- auto-titles ----------------------------------------------------------
// Twitch's docs warn these are common, and both of these are in the archive.
check('a lone letter is an auto-title', isStreamTitle('a', DBD), true);
check('a lone full stop is not a title', isStreamTitle('.', DBD), true);
check('punctuation only is not a title', isStreamTitle('...', DBD), true);
check('a lone emoji is not a title', isStreamTitle('😂', DBD), true);
// ...but two characters of substance are enough to be a real reaction.
check('XD is a real reaction', isStreamTitle('XD', DBD), false);
check('so is a two-letter word', isStreamTitle('ne', DBD), false);
check('an emoji plus a word survives', isStreamTitle('😂 co', DBD), false);

// --- empty and redundant --------------------------------------------------
check('blank is unusable', isStreamTitle('', DBD), true);
check('whitespace is unusable', isStreamTitle('   ', DBD), true);
check('undefined is unusable', isStreamTitle(undefined, DBD), true);
check('just the game name adds nothing', isStreamTitle('Dead by Daylight', DBD), true);
check('and case does not matter', isStreamTitle('dead by daylight', DBD), true);
check('but a title containing the game does survive', isStreamTitle('Dead by Daylight je peklo', DBD), false);
check('and without a game to compare, it stands', isStreamTitle('Dead by Daylight'), false);

// --- the rendered label ---------------------------------------------------
check(
  'a good title stands alone',
  clipLabel({ title: 'Kolo kolo mlýnský', game: DBD, createdAt: '2026-08-17T19:00:00Z' }),
  { text: 'Kolo kolo mlýnský', isFallback: false },
);
check(
  'a stand-in carries the date, or identical rows would repeat',
  clipLabel({ title: '🔴 Dead by Daylight 🔴 !dc !ig !clip', game: DBD, createdAt: '2026-08-02T19:00:00Z' }),
  { text: 'Dead by Daylight · 2. 8.', isFallback: true },
);
check(
  'the month is not zero-padded, matching the calendar',
  clipLabel({ title: '', game: 'Just Chatting', createdAt: '2026-01-05T19:00:00Z' }),
  { text: 'Just Chatting · 5. 1.', isFallback: true },
);
check(
  'no game still yields something printable',
  clipLabel({ title: '', createdAt: '2026-08-02T19:00:00Z' }),
  { text: 'Klip · 2. 8.', isFallback: true },
);
check(
  'a broken date does not produce a dangling separator',
  clipLabel({ title: '', game: DBD, createdAt: 'nesmysl' }),
  { text: 'Dead by Daylight', isFallback: true },
);
check(
  'nothing at all is still not blank',
  clipLabel({ createdAt: '' }),
  { text: 'Klip', isFallback: true },
);
check(
  'a title is trimmed, not just accepted',
  clipLabel({ title: '  item 👀  ', game: DBD, createdAt: '2026-09-06T19:00:00Z' }),
  { text: 'item 👀', isFallback: false },
);

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} clip-label checks passed.`);
