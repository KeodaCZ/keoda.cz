/**
 * Pure logic for the Twitch clip archive. No network, no filesystem — so the
 * part that can destroy the archive is unit-testable without credentials.
 *
 * The archive is the database (see CLAUDE.md). Two rules follow from that and
 * neither is negotiable:
 *
 *   1. Fetching only ever ADDS. There is no "get all clips" call — the API caps
 *      pagination — so any run sees a window, never the whole history. Code
 *      that writes what it fetched would silently delete everything outside
 *      that window.
 *   2. Removal is a flag, never a deletion. A clip that vanishes from Twitch
 *      keeps its record with `removed: true`, so the site can stop linking it
 *      without the archive forgetting it existed.
 */

/** Which year file a clip belongs in, from its own creation date. */
export function yearOf(clip) {
  return clip.createdAt.slice(0, 4);
}

/**
 * Fields that can legitimately change on Twitch after a clip is created.
 * Everything else is written once and then left alone, so a re-fetch of the
 * same clip produces no diff.
 *
 * View counts are deliberately NOT stored at all: they change constantly, and
 * with a fetch every 6 hours they would rewrite hundreds of lines a day,
 * bloating the repo and burying real changes in the history. The site wants
 * recent clips, and `featured` covers highlights.
 */
const MUTABLE = ['title', 'game', 'featured'];

/**
 * Folds freshly fetched clips into the existing archive.
 *
 * @param {Record<string, {clips: object[]}>} existing  year -> file contents
 * @param {object[]} fetched  clips as returned by the fetch, newest-first or not
 * @returns {{byYear: Record<string, {clips: object[]}>, added: object[], updated: string[], restored: string[]}}
 */
export function mergeClips(existing, fetched) {
  // Deep-ish copy: the caller's object must not change under it.
  const byYear = {};
  for (const [year, file] of Object.entries(existing ?? {})) {
    byYear[year] = { clips: (file?.clips ?? []).map((clip) => ({ ...clip })) };
  }

  const index = new Map();
  for (const file of Object.values(byYear)) {
    for (const clip of file.clips) index.set(clip.id, clip);
  }

  const added = [];
  const updated = [];
  const restored = [];

  for (const clip of fetched) {
    const known = index.get(clip.id);

    if (!known) {
      const year = yearOf(clip);
      byYear[year] ??= { clips: [] };
      byYear[year].clips.push({ ...clip });
      index.set(clip.id, clip);
      added.push(clip);
      continue;
    }

    // Seeing a clip in a fetch is proof it exists, so a stale removal lifts.
    if (known.removed) {
      delete known.removed;
      restored.push(clip.id);
    }

    let changed = false;
    for (const field of MUTABLE) {
      if (clip[field] !== undefined && clip[field] !== known[field]) {
        known[field] = clip[field];
        changed = true;
      }
    }
    if (changed) updated.push(clip.id);
  }

  return { byYear: sortAll(byYear), added, updated, restored };
}

/**
 * Marks clips that Twitch no longer returns, and reports how much of the
 * archive that is.
 *
 * The ratio counts only *newly* missing clips against the clips that were
 * present before this run — not against the whole archive. Measuring against
 * the whole archive would creep upward as legitimate removals accumulate until
 * every run tripped the safety valve for no reason.
 *
 * @param {Record<string, {clips: object[]}>} existing
 * @param {Set<string>} presentIds  ids Twitch confirmed still exist
 * @param {string[]} checkedIds  ids this run actually asked about
 */
export function applyRemovals(existing, presentIds, checkedIds) {
  const checked = new Set(checkedIds);
  const byYear = {};
  for (const [year, file] of Object.entries(existing ?? {})) {
    byYear[year] = { clips: (file?.clips ?? []).map((clip) => ({ ...clip })) };
  }

  const newlyRemoved = [];
  const restored = [];
  let wasPresent = 0;

  for (const file of Object.values(byYear)) {
    for (const clip of file.clips) {
      // Never conclude anything about a clip this run did not ask about.
      if (!checked.has(clip.id)) continue;

      if (!clip.removed) wasPresent += 1;

      if (presentIds.has(clip.id)) {
        if (clip.removed) {
          delete clip.removed;
          restored.push(clip.id);
        }
      } else if (!clip.removed) {
        clip.removed = true;
        newlyRemoved.push(clip.id);
      }
    }
  }

  return {
    byYear: sortAll(byYear),
    newlyRemoved,
    restored,
    wasPresent,
    // 0 when nothing was present to lose, so an empty archive cannot trip the valve.
    missingRatio: wasPresent === 0 ? 0 : newlyRemoved.length / wasPresent,
  };
}

/**
 * Whether a reconciliation result looks like mass deletion rather than an API
 * failure. Losing a fifth of the archive between weekly runs does not happen
 * for real reasons.
 */
export function looksLikeApiFailure(result, threshold = 0.2) {
  return result.missingRatio > threshold;
}

/** Newest first within each year — the order the site wants to render. */
function sortAll(byYear) {
  for (const file of Object.values(byYear)) {
    file.clips.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }
  return byYear;
}
