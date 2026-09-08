/**
 * Checks for the YouTube bucketing. Run: npm test
 *
 * There is no API flag that says "this is a Short", so the split is a
 * heuristic on duration — and a heuristic that runs unattended deserves to be
 * pinned down, especially the case the docs warn about: a vertical video
 * longer than three minutes is a regular video to YouTube, and must be one
 * here too.
 */
import { parseDuration, classify, isStillLive, happenedAt } from '../scripts/fetch-youtube.mjs';

let passed = 0;
const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
};

// --- parseDuration --------------------------------------------------------
check('seconds only', parseDuration('PT45S'), 45);
check('minutes and seconds', parseDuration('PT2M30S'), 150);
check('exactly three minutes', parseDuration('PT3M'), 180);
check('hours', parseDuration('PT1H'), 3600);
check('a long stream', parseDuration('PT4H12M9S'), 15129);
check('whole days, which long streams can reach', parseDuration('P1DT2H'), 93600);
check('a missing duration is zero, not NaN', parseDuration(undefined), 0);
check('nonsense is zero', parseDuration('banán'), 0);

// --- classify -------------------------------------------------------------
const video = (extra) => ({ id: 'x', duration: 0, wasLive: false, ...extra });

check('a short clip is a Short', classify(video({ duration: 45 })), 'short');
check('exactly 180s is still a Short', classify(video({ duration: 180 })), 'short');
check('181s is a regular video', classify(video({ duration: 181 })), 'video');
check('a long video is a video', classify(video({ duration: 1200 })), 'video');

// The documented trap: length wins over shape, because shape is not in the API.
check(
  'a vertical video over 3 min counts as a video, as YouTube says',
  classify(video({ duration: 400 })),
  'video',
);

// liveStreamingDetails is the only reliable signal, so it outranks duration.
check('a past broadcast is a stream', classify(video({ duration: 9000, wasLive: true })), 'stream');
check(
  'even a short one — a stream that died after a minute is still a stream',
  classify(video({ duration: 60, wasLive: true })),
  'stream',
);

// A zero duration means the API did not tell us; guessing "Short" there would
// quietly file livestreams and broken records under Shorts.
check('unknown duration is not a Short', classify(video({ duration: 0 })), 'video');

// --- overrides ------------------------------------------------------------
const overrides = { x: 'short' };
check('an override wins over the heuristic', classify(video({ duration: 400 }), overrides), 'short');
check(
  'an override for another id is ignored',
  classify(video({ id: 'y', duration: 400 }), overrides),
  'video',
);
check(
  'an override can force a stream too',
  classify(video({ duration: 45 }), { x: 'stream' }),
  'stream',
);
check(
  'a nonsense override falls back to the heuristic',
  classify(video({ duration: 45 }), { x: 'kdovico' }),
  'short',
);

// --- a broadcast still in progress ----------------------------------------
// Observed for real: one stream produced two commits four hours apart, with
// publishedAt rewritten from 17:12 to 21:53, a changed duration and the
// thumbnail swapped off _live.jpg. YouTube's metadata is provisional until a
// stream ends, so mid-flight streams are skipped rather than stored and then
// corrected.
check(
  'started but not ended is live now',
  isStillLive({ startedAt: '2026-09-07T17:12:30Z', endedAt: '' }),
  true,
);
check(
  'started and ended is an archive item',
  isStillLive({ startedAt: '2026-09-07T17:12:30Z', endedAt: '2026-09-07T21:34:00Z' }),
  false,
);
// An ordinary upload has neither, and must not be mistaken for a live stream.
check('a plain video is not live', isStillLive({ startedAt: '', endedAt: '' }), false);
check('nor is one with no live fields at all', isStillLive({}), false);

// --- which date counts ----------------------------------------------------
check(
  'a stream is dated by when it started, not when YouTube finished with it',
  happenedAt({ startedAt: '2026-09-07T17:12:30Z', publishedAt: '2026-09-07T21:53:24Z' }),
  '2026-09-07T17:12:30Z',
);
check(
  'an ordinary upload falls back to publishedAt',
  happenedAt({ startedAt: '', publishedAt: '2026-05-01T10:00:00Z' }),
  '2026-05-01T10:00:00Z',
);
check('and with neither, an empty string rather than undefined', happenedAt({}), '');

if (failures.length) {
  console.error(`${failures.length} FAILED, ${passed} passed:\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`All ${passed} YouTube checks passed.`);
