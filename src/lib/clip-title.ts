/**
 * What to print above a clip.
 *
 * Twitch fills a clip's title with the *stream's* title whenever the person
 * clipping doesn't type one, which is most of the time. Real data from the
 * channel: five of the eight newest clips came back as
 * "🔴 Dead by Daylight 🔴 !dc !ig !clip" — the stream title, chat commands and
 * all. Printed as-is that is five identical rows full of commands that mean
 * nothing outside Twitch chat.
 *
 * This is deliberately display logic and not a fetch-time rewrite: the archive
 * keeps whatever Twitch actually said, so sharpening this rule later needs no
 * re-fetch and loses no information. (Owner's call 2026-09-07.)
 */

export interface ClipLike {
  title?: string;
  game?: string;
}

export interface ClipLabel {
  text: string;
  /** True when the clip's own title was unusable and this is a stand-in. */
  isFallback: boolean;
}

/**
 * Whether a title is the stream's rather than the clip's.
 *
 * Each test is anchored to something seen in the real data, because a
 * false positive here throws away a title the owner actually wrote.
 */
export function isStreamTitle(title: string | undefined, game?: string): boolean {
  const trimmed = (title ?? '').trim();
  if (trimmed.length === 0) return true;

  // Twitch's own docs warn that auto-titles like "a" are common, and the
  // archive has both "a" and "." in it. Fewer than two letters or digits is
  // not a title, whatever else the string contains. "XD" and "item 👀" clear
  // this; a lone full stop does not.
  const substance = (trimmed.match(/[\p{L}\p{N}]/gu) ?? []).length;
  if (substance < 2) return true;

  // A standalone !command. Matches "!dc" but not "wow!", so a genuine title
  // that merely ends in an exclamation mark survives.
  if (/(^|\s)![\p{L}]{2,}\b/u.test(trimmed)) return true;

  // The owner's stream titles are wrapped in 🔴. A clip title would have no
  // reason to carry it.
  if (trimmed.includes('🔴')) return true;

  // Just the game name says no more than the game field already does.
  if (game && trimmed.toLowerCase() === game.trim().toLowerCase()) return true;

  return false;
}

/**
 * The heading to render for a clip: its own title, or the game as a stand-in.
 *
 * Deliberately without a date. An earlier version appended one so that several
 * clips from the same game would not render identically — but every place that
 * shows a clip already prints the date on its own line, so including it here
 * printed it twice. The card, not this function, supplies the context.
 *
 * (That earlier version also read `createdAt`, which the view model renames to
 * `date` — so the date was silently undefined and dropped anyway. Caught by
 * reading the rendered page rather than by a test, since both spellings type
 * fine when the field is optional.)
 */
export function clipLabel(clip: ClipLike): ClipLabel {
  const title = (clip.title ?? '').trim();

  if (!isStreamTitle(title, clip.game)) {
    return { text: title, isFallback: false };
  }

  const game = (clip.game ?? '').trim();
  return { text: game || 'Klip', isFallback: true };
}
