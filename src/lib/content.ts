/**
 * Binds the content archive to the committed JSON. Everything here runs at
 * build time; the site never calls YouTube or Twitch at request time.
 *
 * The three YouTube buckets stay separate all the way through rather than
 * being merged and re-split: they are genuinely different content. A stream is
 * a four-hour VOD, a Short is thirty seconds, and an edited video is neither.
 */
import youtube from '../../data/youtube.json';
import hiddenData from '../../data/hidden.json';
import featuredData from '../../data/featured.json';
import { cleanTitle, curate, type MediaItem } from './content-core';

export type { MediaItem };

export interface Stream extends MediaItem {
  endedAt?: string;
}

export interface Clip extends MediaItem {
  /** Who made the clip — always someone other than the owner, so credit it. */
  creator: string;
  url: string;
  game?: string;
  /** Twitch's own flag. Drives a badge, not the ordering — see below. */
  featured?: boolean;
  /** Set by the weekly reconciliation when Twitch no longer has the clip. */
  removed?: boolean;
}

const hidden: string[] = hiddenData.ids ?? [];
const featured: string[] = featuredData.ids ?? [];

/**
 * `featured.json` is the owner's ordering and is applied here. A clip's own
 * `featured` flag comes from Twitch and deliberately does *not* reorder
 * anything — Twitch's idea of featured is not the site's, and letting it
 * shuffle the archive would make the order change without anyone touching the
 * repo.
 */
function prepare<T extends { id: string }>(items: T[]): T[] {
  return curate(items, hidden, featured);
}

/** YouTube stores publishedAt; clips store createdAt. One name downstream. */
type YoutubeRecord = {
  id: string;
  title: string;
  publishedAt: string;
  duration: number;
  thumb: string;
  endedAt?: string;
};

const fromYoutube = (record: YoutubeRecord) => ({
  id: record.id,
  // Cleaned here rather than in the data: youtube.json keeps whatever YouTube
  // says, and this module is the view over it. Changing the rule then needs no
  // re-fetch and throws nothing away — same split as clip labels.
  title: cleanTitle(record.title),
  thumb: record.thumb,
  duration: record.duration,
  date: record.publishedAt,
  ...(record.endedAt ? { endedAt: record.endedAt } : {}),
});

export const streams: Stream[] = prepare((youtube.streams as YoutubeRecord[]).map(fromYoutube));
export const videos: MediaItem[] = prepare((youtube.videos as YoutubeRecord[]).map(fromYoutube));
export const shorts: MediaItem[] = prepare((youtube.shorts as YoutubeRecord[]).map(fromYoutube));

/**
 * Every year file at once. A glob rather than a list of imports, so the year
 * that starts in January needs no code change — the same reasoning as the
 * sitemap.
 */
type ClipRecord = {
  id: string;
  title: string;
  createdAt: string;
  creator: string;
  duration: number;
  thumb: string;
  url: string;
  game?: string;
  featured?: boolean;
  removed?: boolean;
};

const clipFiles = import.meta.glob<{ clips: ClipRecord[] }>('../../data/clips/*.json', {
  eager: true,
});

const allClips: Clip[] = Object.entries(clipFiles)
  // Newest year first, so the concatenated list starts out roughly sorted.
  .sort(([a], [b]) => b.localeCompare(a))
  .flatMap(([, file]) => file.clips ?? [])
  .map((record) => ({
    id: record.id,
    title: record.title,
    thumb: record.thumb,
    duration: record.duration,
    date: record.createdAt,
    creator: record.creator,
    url: record.url,
    ...(record.game ? { game: record.game } : {}),
    ...(record.featured ? { featured: true } : {}),
    ...(record.removed ? { removed: true } : {}),
  }))
  // A clip Twitch no longer has cannot be watched, so it must not be linked.
  // The record stays in the JSON — that is the point of the soft delete — but
  // the site stops offering it.
  .filter((clip) => !clip.removed)
  .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

export const clips: Clip[] = prepare(allClips);

/**
 * Thumbnail URL for a YouTube id, derived rather than taken from the stored
 * `thumb` — because which variant matters a great deal here.
 *
 * Measured on a real stream: `maxresdefault` is 188 kB, `hqdefault` 17 kB. A
 * page of twenty cards is the difference between 3.7 MB and 340 kB, and most
 * traffic arrives on a phone.
 *
 * `hqdefault` is 480×360 with 45px letterbox bars top and bottom — verified,
 * not assumed — so the content is exactly 480×270, precisely 16:9. Rendered in
 * a 16:9 box with `object-fit: cover` the bars crop away and the full frame
 * shows. `mqdefault` is true 16:9 at 11 kB but only 320px wide, too soft for a
 * card.
 *
 * `hero` keeps the stored high-resolution URL, for the one place a big image
 * earns its bytes.
 */
export function youtubeThumb(item: MediaItem, size: 'card' | 'hero' = 'card'): string {
  if (size === 'hero') return item.thumb || `https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`;
  return `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
}
