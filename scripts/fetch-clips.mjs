/**
 * Adds recently created Twitch clips to the archive.
 *
 * Run: node scripts/fetch-clips.mjs
 * Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the environment.
 *
 * Two Helix behaviours shape this script:
 *
 *   - Results come back ordered by **view count**, never chronologically. The
 *     site wants recent clips, so the window is a date range and the sorting
 *     happens here, not in the query.
 *   - `started_at`/`ended_at` only work alongside `broadcaster_id`, and
 *     omitting `ended_at` silently narrows the range to one week.
 *
 * It only ever adds (see lib/clips-store.mjs). Removals are a separate weekly
 * job, because absence from a window proves nothing.
 */
import { mergeClips } from './lib/clips-store.mjs';
import { readClipArchive, writeClipArchive } from './lib/files.mjs';
import {
  BROADCASTER_ID,
  assertBroadcaster,
  gameNames,
  getAppToken,
  helixAll,
  toRecord,
} from './lib/twitch.mjs';

// Widen if the channel has been quiet, so the site's clip section is never
// empty just because the last month happened to be.
const WINDOWS_DAYS = [30, 90, 365];
const ENOUGH = 8;

async function clipsSince(token, days) {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - days * 86400 * 1000);

  const { items, hitCap } = await helixAll(token, 'clips', {
    broadcaster_id: BROADCASTER_ID,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
  });

  if (hitCap) {
    console.warn(`⚠  ${days} dní: došel strop stránkování, okno je moc široké na jeden běh.`);
  }
  return items;
}

async function main() {
  const token = await getAppToken();
  const user = await assertBroadcaster(token);
  console.log(`Kanál ${user.display_name} (id ${BROADCASTER_ID}) potvrzen.`);

  let raw = [];
  for (const days of WINDOWS_DAYS) {
    raw = await clipsSince(token, days);
    console.log(`Okno ${days} dní: ${raw.length} klipů.`);
    if (raw.length >= ENOUGH) break;
  }

  if (raw.length === 0) {
    console.log('Twitch nevrátil žádné klipy — nechávám archiv být.');
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

  // Merge can only grow the archive. If it ever shrinks, the logic is wrong
  // and writing would make it permanent.
  if (after < before) {
    throw new Error(`Archiv by se zmenšil z ${before} na ${after} klipů. Nic nezapisuju.`);
  }

  const written = writeClipArchive(byYear);

  console.log(`Nových: ${added.length}, upravených: ${updated.length}, obnovených: ${restored.length}.`);
  console.log(`Archiv: ${before} → ${after} klipů.`);
  console.log(written.length ? `Přepsané roky: ${written.join(', ')}.` : 'Beze změny, nic se nezapsalo.');
  for (const clip of added.slice(0, 10)) {
    console.log(`  + ${clip.createdAt.slice(0, 10)}  ${clip.title || '(bez titulku)'}`);
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
