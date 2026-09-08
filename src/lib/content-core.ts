/**
 * Pure helpers for the content archive. No imports, so the tests run in plain
 * Node — the JSON binding lives in content.ts.
 */

export interface MediaItem {
  id: string;
  title: string;
  thumb: string;
  duration: number;
  /** ISO timestamp. YouTube items call it publishedAt, clips createdAt. */
  date: string;
}

/**
 * Clock duration, the convention every video thumbnail already uses: '0:32',
 * '2:45', '4:12:09'. Deliberately not "4 h 12 min" — these sit in a corner of
 * a thumbnail where short and unambiguous beats readable prose.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';

  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Czech date, always with the year: the archive spans 2023 to now, so a
 * bare "6. 9." would be ambiguous in exactly the place it matters.
 */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!match) return '';
  const [, year, month, day] = match;
  return `${Number(day)}. ${Number(month)}. ${year}`;
}

/** 'září 2026' — the heading a month-grouped list needs. */
const MONTHS = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
];

export function monthName(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  if (!match) return '';
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/** Month key for grouping, so sorting by it matches sorting by date. */
export function monthKey(iso: string): string {
  return (iso ?? '').slice(0, 7);
}

/**
 * Applies the two hand-edited curation files.
 *
 * `hidden.json` wins over everything — it is how the owner takes something off
 * the site without deleting it upstream. `featured.json` pins items to the
 * front **in the order they are listed there**, because that order is the
 * owner's ranking and re-sorting it would throw away the only thing it says.
 *
 * An id in either file that no longer exists is ignored rather than an error:
 * a video can be deleted on YouTube long after someone pinned it, and that
 * must not break the build.
 */
export function curate<T extends { id: string }>(
  items: T[],
  hidden: Iterable<string> = [],
  featured: Iterable<string> = [],
): T[] {
  const hide = new Set(hidden);
  const pin = [...featured];
  const pinned = new Set(pin);

  const kept = items.filter((item) => !hide.has(item.id));
  const byId = new Map(kept.map((item) => [item.id, item]));

  const front = pin.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  const rest = kept.filter((item) => !pinned.has(item.id));

  return [...front, ...rest];
}

/** Groups a date-sorted list into month blocks, order preserved. */
export function groupByMonth<T extends { date: string }>(
  items: T[],
): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];

  for (const item of items) {
    const key = monthKey(item.date);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: monthName(item.date), items: [item] });
  }

  return groups;
}

/**
 * Strips the Twitch-chat furniture out of a stream title.
 *
 * The owner wraps his stream titles in 🔴 and ends them with the chat commands
 * viewers use — "🔴 Vybereme MC RPG modpack a následně DbD 🔴 !dc !ig !clip".
 * On Twitch that is useful. In an archive of 400+ rows it is the same eight
 * characters of noise on every line, and `!dc` means nothing to someone
 * reading a list of past streams.
 *
 * Unlike a clip title, a stream title is genuinely the content, so this
 * removes rather than replaces — and stays narrow on purpose:
 *
 *   - `!word` only as a standalone token, so "to bylo těsný!" survives
 *   - 🔴 only, because that is his live marker; 😭 or 👀 are his own voice
 *   - if stripping would leave nothing, the original stands
 */
export function cleanTitle(title: string | undefined): string {
  const original = (title ?? '').trim();
  if (!original) return '';

  const stripped = original
    .replace(/(^|\s)![\p{L}]{2,}\b/gu, ' ')
    .replaceAll('🔴', ' ')
    .replace(/\s+/g, ' ')
    // A separator left dangling once what followed it is gone.
    .replace(/[\s|·—–-]+$/u, '')
    .replace(/^[\s|·—–-]+/u, '')
    .trim();

  return stripped.length > 0 ? stripped : original;
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeShortUrl = (id: string) => `https://www.youtube.com/shorts/${id}`;
