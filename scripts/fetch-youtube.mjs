/**
 * Rebuilds data/youtube.json: regular videos, Shorts, and the stream archive.
 *
 * Run: node scripts/fetch-youtube.mjs
 * Needs YOUTUBE_API_KEY in the environment.
 *
 * YouTube is the canonical stream archive, not Twitch: Twitch VODs expire
 * (7 days base, up to 60 for Partner+Turbo), so any Twitch-sourced history
 * rots. The owner multistreams, so YouTube keeps everything.
 *
 * Unlike the clip archive this is a full refresh, not a merge, and that is a
 * deliberate difference: the uploads playlist is fully paginable, so the API
 * really is the complete source of truth here. A deleted or privated video
 * should disappear from the site, and an edited title should update. There is
 * still a safety valve, because "the API returned less than usual" must not be
 * allowed to truncate the file.
 *
 * Quota is a non-issue: 10,000 units/day and these calls cost 1 unit each.
 */
import path from 'node:path';
import { ROOT, readJson, writeJsonIfChanged } from './lib/files.mjs';
import { fail, scrub } from './lib/secrets.mjs';

const CHANNEL_HANDLE = 'KeodaCZ';
const API = 'https://www.googleapis.com/youtube/v3';
const OUT = path.join(ROOT, 'data', 'youtube.json');
const OVERRIDES = path.join(ROOT, 'data', 'youtube-overrides.json');

/** A Short is at most 3 minutes. See the trap note in classify(). */
const SHORT_MAX_SECONDS = 180;

/** If a refresh finds this much less than we already have, something is wrong. */
const SHRINK_TOLERANCE = 0.8;

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('Chybí YOUTUBE_API_KEY.');
  return key;
}

async function get(resource, params) {
  const url = new URL(`${API}/${resource}`);
  for (const [k, v] of Object.entries({ ...params, key: apiKey() })) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const response = await fetch(url);
  if (!response.ok) {
    let detail = '';
    try {
      // The error body names the cause: quota, disabled API, bad key. It
      // carries no credential itself, but the key does ride in the query
      // string, so the message goes through scrub() below anyway — a
      // network-layer failure can put the whole URL into an error.
      const body = await response.json();
      detail = body?.error?.message ? ` — ${body.error.message}` : '';
    } catch {
      /* keep the status only */
    }
    throw new Error(scrub(`YouTube ${resource}: HTTP ${response.status}${detail}`));
  }
  return response.json();
}

/** ISO 8601 duration ('PT1H2M3S') to seconds. */
export function parseDuration(iso) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!match) return 0;
  const [, d, h, m, s] = match.map((v) => (v ? Number(v) : 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

/**
 * Which of the three buckets a video belongs to.
 *
 * The Shorts test is a heuristic because there is no API flag for it, and it
 * has one known trap: a vertical video *longer* than 3 minutes is a regular
 * video as far as YouTube is concerned, and this rule agrees with that. The
 * override file exists for the cases where it does not.
 */
export function classify(video, overrides = {}) {
  const forced = overrides[video.id];
  if (forced === 'video' || forced === 'short' || forced === 'stream') return forced;

  // A recorded livestream is a stream whatever its length.
  if (video.wasLive) return 'stream';
  return video.duration > 0 && video.duration <= SHORT_MAX_SECONDS ? 'short' : 'video';
}

/**
 * A broadcast still in progress: it has a start time but no end time yet.
 *
 * These are skipped, and observing the real feed is what showed why. One
 * stream produced two commits four hours apart — the same video, with
 * `publishedAt` rewritten from 17:12 to 21:53, `duration` changed, and the
 * thumbnail swapped from `maxresdefault_live.jpg` to `maxresdefault.jpg`.
 * YouTube reports provisional metadata while a stream runs and finalises it
 * afterwards, so archiving one mid-flight means storing values that are wrong
 * and then rewriting them.
 *
 * Nothing is lost by waiting: the next run after the stream ends picks it up
 * with final values, and the homepage already shows the live player while it
 * is on.
 */
export function isStillLive(video) {
  if (Boolean(video.startedAt) && !video.endedAt) return true;

  // Second signal, and the more trustworthy one. The run that stored this
  // stream mid-flight fired three seconds after its actualEndTime, so an end
  // time appearing tells us nothing about whether the rest of the record has
  // settled — and it plainly had not: publishedAt, duration and the thumbnail
  // were all still provisional.
  //
  // YouTube serves `maxresdefault_live.jpg` while a broadcast is unprocessed
  // and swaps to `maxresdefault.jpg` afterwards, so the suffix says outright
  // that this record is not final yet.
  return /_live\.[a-z]+(\?|$)/i.test(video.thumb ?? '');
}

/**
 * When the thing actually happened.
 *
 * For a stream that is `actualStartTime`, which never changes — unlike
 * `publishedAt`, which YouTube moves to roughly the end of the broadcast once
 * it finishes processing. An archive sorted on `publishedAt` would order
 * streams by when YouTube finished with them.
 */
export function happenedAt(video) {
  return video.startedAt || video.publishedAt || '';
}

async function uploadsPlaylistId() {
  const { items } = await get('channels', { part: 'contentDetails', forHandle: CHANNEL_HANDLE });
  const id = items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) throw new Error(`YouTube: kanál @${CHANNEL_HANDLE} nenalezen.`);
  return id;
}

async function allUploadIds(playlistId) {
  const ids = [];
  let pageToken;
  let pages = 0;

  do {
    const page = await get('playlistItems', {
      part: 'contentDetails',
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = page.nextPageToken;
    pages += 1;
    // 50 per page; 200 pages would be 10,000 videos. A cursor that stopped
    // advancing must not spin forever in a scheduled job.
  } while (pageToken && pages < 200);

  return { ids, pages, complete: !pageToken };
}

async function details(ids) {
  const out = [];

  for (let i = 0; i < ids.length; i += 50) {
    const { items } = await get('videos', {
      part: 'snippet,contentDetails,liveStreamingDetails',
      id: ids.slice(i, i + 50).join(','),
      maxResults: 50,
    });

    for (const item of items ?? []) {
      const thumbs = item.snippet?.thumbnails ?? {};
      const live = item.liveStreamingDetails;
      out.push({
        id: item.id,
        title: item.snippet?.title ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        duration: parseDuration(item.contentDetails?.duration),
        thumb: (thumbs.maxres ?? thumbs.standard ?? thumbs.high ?? thumbs.medium ?? {}).url ?? '',
        // Presence of liveStreamingDetails is what marks a past broadcast.
        wasLive: Boolean(live),
        startedAt: live?.actualStartTime ?? '',
        endedAt: live?.actualEndTime ?? '',
      });
    }
  }

  return out;
}

async function main() {
  const playlistId = await uploadsPlaylistId();
  console.log(`Playlist s uploady: ${playlistId}`);

  const { ids, pages, complete } = await allUploadIds(playlistId);
  console.log(`Nalezeno ${ids.length} videí na ${pages} stránkách.`);

  // A partial listing must never be written as if it were the whole channel.
  if (!complete) {
    throw new Error('Stránkování nedošlo na konec — částečný seznam nezapisuju.');
  }
  if (ids.length === 0) {
    throw new Error('Kanál vrátil nula videí. To je nejspíš porucha, nic nezapisuju.');
  }

  const videos = await details(ids);
  const overrides = readJson(OVERRIDES, { types: {} }).types ?? {};

  const buckets = { videos: [], shorts: [], streams: [] };
  let skippedLive = 0;

  for (const video of videos) {
    if (isStillLive(video)) {
      skippedLive += 1;
      continue;
    }

    const kind = classify(video, overrides);
    const record = {
      id: video.id,
      title: video.title,
      // One field name across all three buckets, so consumers need no special
      // case — but sourced from actualStartTime for streams, which is stable.
      publishedAt: happenedAt(video),
      duration: video.duration,
      thumb: video.thumb,
    };
    // Only meaningful on a stream; elsewhere it is noise in the diff.
    if (kind === 'stream') {
      record.wasLive = true;
      record.endedAt = video.endedAt;
    }
    buckets[kind === 'short' ? 'shorts' : kind === 'stream' ? 'streams' : 'videos'].push(record);
  }

  if (skippedLive > 0) {
    console.log(`Přeskočeno ${skippedLive} právě běžících streamů — metadata ještě nejsou finální.`);
  }

  for (const list of Object.values(buckets)) {
    list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  }

  const previous = readJson(OUT, null);
  if (previous) {
    const before =
      (previous.videos?.length ?? 0) + (previous.shorts?.length ?? 0) + (previous.streams?.length ?? 0);
    const after = buckets.videos.length + buckets.shorts.length + buckets.streams.length;
    if (before > 0 && after < before * SHRINK_TOLERANCE) {
      throw new Error(
        `Z ${before} videí zbylo ${after} — to je moc velký úbytek na jeden běh. Nic nezapisuju.`,
      );
    }
  }

  const changed = writeJsonIfChanged(OUT, buckets);

  console.log(
    `Videa: ${buckets.videos.length}, Shorts: ${buckets.shorts.length}, streamy: ${buckets.streams.length}.`,
  );
  console.log(changed ? 'data/youtube.json přepsán.' : 'Beze změny, nic se nezapsalo.');
}

// Only run when invoked directly, so the tests can import the pure helpers.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetch-youtube.mjs')) {
  main().catch(fail);
}
