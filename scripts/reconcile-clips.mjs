/**
 * Marks archived clips that no longer exist on Twitch.
 *
 * Run: node scripts/reconcile-clips.mjs
 * Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the environment.
 *
 * The fetch job only ever adds, so without this the archive would keep dead
 * links forever. Removal is a flag and never a deletion: the record stays so
 * the site can stop linking a clip without the archive forgetting it existed.
 *
 * The safety valve matters more than the feature. This runs unattended against
 * someone else's API; a bad token, a partial outage or a changed response shape
 * all look exactly like "everything was deleted". Losing a fifth of the archive
 * in a week does not happen for real reasons, so above that it writes nothing.
 */
import { applyRemovals, looksLikeApiFailure } from './lib/clips-store.mjs';
import { readClipArchive, writeClipArchive } from './lib/files.mjs';
import { assertBroadcaster, getAppToken, helix } from './lib/twitch.mjs';

// Helix caps `Get Clips?id=` at 100 ids per request.
const BATCH = 100;
const THRESHOLD = 0.2;

async function main() {
  const existing = readClipArchive();
  const allIds = Object.values(existing).flatMap((file) => (file.clips ?? []).map((c) => c.id));

  if (allIds.length === 0) {
    console.log('Archiv je prázdný — není co kontrolovat.');
    return;
  }

  const token = await getAppToken();
  const user = await assertBroadcaster(token);
  console.log(`Kanál ${user.display_name} potvrzen. Kontroluju ${allIds.length} klipů.`);

  const present = new Set();
  const checked = [];

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    const { data } = await helix(token, 'clips', { id: batch });
    for (const clip of data ?? []) present.add(clip.id);
    // Only ids we actually asked about may be judged; a batch that threw would
    // otherwise read as a batch full of deletions.
    checked.push(...batch);
    console.log(`  dávka ${i / BATCH + 1}: ${batch.length} dotázáno, ${data?.length ?? 0} existuje`);
  }

  const result = applyRemovals(existing, present, checked);

  console.log(
    `Zmizelo: ${result.newlyRemoved.length} z ${result.wasPresent} dosud existujících ` +
      `(${(result.missingRatio * 100).toFixed(1)} %).`,
  );

  if (looksLikeApiFailure(result, THRESHOLD)) {
    console.error(
      `✗ Nad ${THRESHOLD * 100} % — to je porucha API, ne mazání. Nic nezapisuju.\n` +
        '  Pust to znovu ručně (workflow_dispatch); jestli to vyjde stejně, koukni na Twitch ručně.',
    );
    process.exit(1);
  }

  const written = writeClipArchive(result.byYear);

  for (const id of result.newlyRemoved) console.log(`  - ${id}`);
  for (const id of result.restored) console.log(`  + zpět: ${id}`);
  console.log(written.length ? `Přepsané roky: ${written.join(', ')}.` : 'Beze změny, nic se nezapsalo.');
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
