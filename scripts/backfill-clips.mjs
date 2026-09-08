/**
 * Walks the whole channel history and adds every clip Twitch still has.
 *
 * Run: npm run clips:backfill
 * Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (read from .env locally).
 *
 * Why this exists at all: there is no "get all clips" call. Helix pagination on
 * clips tops out around 1,000 results, and the documented way past that is to
 * ask for separate date windows. `fetch-clips.mjs` only ever looks at the last
 * 30–365 days, so everything older than its widest window is invisible to it —
 * the archive held 31 clips against several hundred that exist.
 *
 * Clips do not expire the way VODs do, so the history is all still there and
 * this only has to be right once. It is safe to re-run: it merges, and the
 * merge only ever adds (see lib/clips-store.mjs).
 *
 * Two things it deliberately does not guess:
 *
 *   - **Where to stop.** The floor is the channel's own `created_at` from
 *     `Get Users`, not a year typed in here. A guess that is too recent loses
 *     clips silently, which is the one failure mode nobody would notice.
 *   - **Whether a window was complete.** A window that hits the pagination cap
 *     is split in half and retried rather than warned about, because a warning
 *     in a one-off script's output is a warning nobody reads twice.
 */
import { mergeClips } from './lib/clips-store.mjs';
import { readClipArchive, writeClipArchive } from './lib/files.mjs';
import { fail } from './lib/secrets.mjs';
import {
  BROADCASTER_ID,
  assertBroadcaster,
  gameNames,
  getAppToken,
  helixAll,
  toRecord,
} from './lib/twitch.mjs';

/** One request is one rate-limit point against a bucket of 800/min, so this is
 *  courtesy rather than necessity — a few hundred requests as fast as the
 *  event loop allows is rude to somebody else's API for no gain. */
const PAUSE_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Month-sized windows from `from` to `to`, newest first.
 *
 * Built with UTC month arithmetic and not by subtracting 30 days: uneven months
 * would drift a day or two per step and, over three years, land the boundaries
 * mid-month where a busy stream night is easiest to straddle.
 */
export function monthWindows(from, to) {
  const windows = [];
  let end = to;

  while (end > from) {
    const start = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, end.getUTCDate(), 0, 0, 0),
    );
    windows.push({ start: start < from ? from : start, end });
    end = start;
  }

  return windows;
}

/**
 * Every clip in one window, splitting the window if Helix runs out of pages.
 *
 * A window that hits the cap is not merely incomplete, it is incomplete at the
 * *quiet* end: results come back ordered by view count, so what falls off is an
 * arbitrary slice rather than the oldest. Halving is the only honest fix.
 */
async function clipsInWindow(token, { start, end }, depth = 0) {
  const { items, hitCap } = await helixAll(token, 'clips', {
    broadcaster_id: BROADCASTER_ID,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
  });

  if (!hitCap) return items;

  // A single day that still hits the cap means over a thousand clips in 24
  // hours; take what we got rather than recursing forever.
  const spanDays = (end - start) / 86400000;
  if (spanDays <= 1 || depth >= 6) {
    console.warn(`⚠  ${label({ start, end })}: strop stránkování i po dělení, beru ${items.length}.`);
    return items;
  }

  const mid = new Date(start.getTime() + (end - start) / 2);
  console.log(`   ${label({ start, end })}: strop stránkování, dělím okno na dvě.`);
  await sleep(PAUSE_MS);
  const older = await clipsInWindow(token, { start, end: mid }, depth + 1);
  await sleep(PAUSE_MS);
  const newer = await clipsInWindow(token, { start: mid, end }, depth + 1);
  return [...older, ...newer];
}

const day = (date) => date.toISOString().slice(0, 10);
const label = ({ start, end }) => `${day(start)} → ${day(end)}`;

async function main() {
  const token = await getAppToken();
  const user = await assertBroadcaster(token);

  // `created_at` on the user is when the Twitch account was made, so no clip
  // can predate it. One day of slack in case of timezone edges at the boundary.
  const accountCreated = new Date(user.created_at);
  const from = new Date(accountCreated.getTime() - 86400000);
  const to = new Date();

  console.log(`Kanál ${user.display_name} (id ${BROADCASTER_ID}), založen ${day(accountCreated)}.`);

  const windows = monthWindows(from, to);
  console.log(`Projdu ${windows.length} měsíčních oken zpátky do ${day(from)}.\n`);

  const raw = [];
  const seen = new Set();
  let emptyWindows = 0;

  for (const [index, window] of windows.entries()) {
    const found = await clipsInWindow(token, window);

    // Windows share their boundary instant, so a clip created exactly on it can
    // come back twice. Dedupe here as well as in the merge: the counts printed
    // below should mean what they say.
    let fresh = 0;
    for (const clip of found) {
      if (seen.has(clip.id)) continue;
      seen.add(clip.id);
      raw.push(clip);
      fresh += 1;
    }

    if (fresh === 0) emptyWindows += 1;
    const position = `${String(index + 1).padStart(3)}/${windows.length}`;
    console.log(`${position}  ${label(window)}  ${String(fresh).padStart(4)} klipů`);

    await sleep(PAUSE_MS);
  }

  console.log(`\nTwitch vrátil ${raw.length} klipů (${emptyWindows} oken bez klipů).`);

  if (raw.length === 0) {
    console.log('Nic k zápisu — archiv nechávám být.');
    return;
  }

  const names = await gameNames(token, raw.map((clip) => clip.game_id));
  const fetched = raw
    .map((clip) => toRecord(clip, names))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const existing = readClipArchive();
  const before = Object.values(existing).reduce((n, file) => n + (file.clips?.length ?? 0), 0);

  const { byYear, added, updated, restored } = mergeClips(existing, fetched);
  const after = Object.values(byYear).reduce((n, file) => n + file.clips.length, 0);

  // Same guard as the incremental fetch: a merge that shrinks the archive is a
  // bug, and writing would make it permanent.
  if (after < before) {
    throw new Error(`Archiv by se zmenšil z ${before} na ${after} klipů. Nic nezapisuju.`);
  }

  const written = writeClipArchive(byYear);

  console.log(`Nových: ${added.length}, upravených: ${updated.length}, obnovených: ${restored.length}.`);
  console.log(`Archiv: ${before} → ${after} klipů.`);
  console.log(written.length ? `Přepsané roky: ${written.join(', ')}.` : 'Beze změny, nic se nezapsalo.');

  const perYear = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, file]) => `${year}: ${file.clips.length}`);
  console.log(`Po letech — ${perYear.join(', ')}.`);
}

// Only run when invoked directly, so the tests can import `monthWindows`.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('backfill-clips.mjs')) {
  main().catch(fail);
}
