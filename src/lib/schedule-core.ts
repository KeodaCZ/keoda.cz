/**
 * Stream schedule logic: recurring weekly pattern + sparse dated exceptions.
 *
 * Pure functions only — data is passed in, so this is unit-testable without a
 * build step. `src/lib/schedule.ts` binds these to the JSON files.
 *
 * All dates are plain 'YYYY-MM-DD' strings in Europe/Prague local time and are
 * never converted to UTC — 18:30 must stay 18:30 across both DST switches.
 * Date arithmetic uses UTC-midnight Date objects purely as a calendar helper,
 * which is DST-safe precisely because no timezone conversion ever happens.
 */

/** Only cancellation needs a status; a stream happening is the default. */
export type ExceptionStatus = 'off';

/** Weekday key -> start time ('18:30'). Missing key means no stream that day. */
export type WeekPattern = Record<string, string | undefined>;

export interface ScheduleException {
  date: string;
  status?: ExceptionStatus;
  /** Overrides the weekly pattern's time for this date. */
  start?: string;
  /** Stream happens, but the time isn't decided — render no time at all. */
  timeUnknown?: boolean;
  /** Force this entry into the homepage banner even if nothing else changed. */
  highlight?: boolean;
  note?: string;
  game?: string;
}

export interface ScheduleDay {
  date: string;
  weekday: string;
  dayMonth: string;
  isToday: boolean;
  isTomorrow: boolean;
  streaming: boolean;
  /** Absent when cancelled, or when the time is explicitly unknown. */
  start?: string;
  note?: string;
  game?: string;
  isException: boolean;
  status?: ExceptionStatus;
  timeUnknown: boolean;
  highlight: boolean;
  /** True when an exception put a stream on a normally free day. */
  added: boolean;
  /** True when this day's time differs from the recurring pattern's. */
  timeChanged: boolean;
}

export interface Banner {
  /** Which day this is about, so a page built earlier can drop it. */
  date: string;
  /** The day word: 'Dnes' | 'Zítra' | 'V pátek'. Recomputed in the browser. */
  when: string;
  /** Everything after the day word, including its leading space or colon. */
  rest: string;
  /** `when + rest`, composed here so the two can never disagree. */
  label: string;
  detail?: string;
}

/** A date that appeared more than once in the exception list. */
export interface DuplicateDate {
  date: string;
  count: number;
}

/**
 * The CMS writes every field it knows about, so untouched ones arrive as empty
 * strings rather than being absent. Treating '' as unset keeps the rest of this
 * module from having to care about the difference.
 */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/** Drops unset fields so `??` and `?.` behave as intended downstream. */
function clean(entry: ScheduleException): ScheduleException {
  const out: ScheduleException = { date: entry.date };
  for (const [key, value] of Object.entries(entry)) {
    if (key !== 'date' && isSet(value)) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/**
 * Collapses several entries for the same date into one, later entries winning
 * field by field, and reports which dates were duplicated.
 *
 * Silently keeping only the first entry — the previous behaviour — could drop a
 * cancellation on the floor, so nothing is discarded without being counted.
 */
export function mergeExceptions(exceptions: ScheduleException[]): {
  merged: ScheduleException[];
  duplicates: DuplicateDate[];
} {
  const byDate = new Map<string, ScheduleException>();
  const counts = new Map<string, number>();

  for (const entry of exceptions) {
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1);
    const existing = byDate.get(entry.date);

    if (!existing) {
      byDate.set(entry.date, clean(entry));
      continue;
    }

    // Later entries win field by field, but an unset value never erases a real
    // one — otherwise a CMS entry left blank could wipe out a cancellation.
    byDate.set(entry.date, { ...existing, ...clean(entry) });
  }

  return {
    merged: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    duplicates: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Index 0 = Sunday, matching Date#getUTCDay(). */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
// Czech needs the locative case here, and the preposition changes:
// "v pátek" but "ve středu".
const DAY_LOCATIVE = [
  'V neděli',
  'V pondělí',
  'V úterý',
  'Ve středu',
  'Ve čtvrtek',
  'V pátek',
  'V sobotu',
];

/** Today's calendar date in the given zone, regardless of where this runs. */
export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function toDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(iso: string, amount: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/**
 * How to name a day relative to "today" — 'Dnes', 'Zítra', or its weekday.
 *
 * Exists to be called **in the browser**, not only at build time. A build
 * renders one fixed idea of "today" and then goes stale: GitHub's cron is
 * delayed by one to four hours in practice (measured), so the nightly rebuild
 * meant to land at 00:20 Prague actually lands around 02:00, leaving the
 * calendar calling yesterday "Dnes" for the first couple of hours after
 * midnight — exactly when people look, since the stream ends around 23:00.
 *
 * The weekday is passed in rather than derived here because it is a pure
 * function of the date and is safely baked at build time; only the
 * today-relative part has to be resolved live.
 */
export function dayLabel(date: string, today: string, weekday: string): string {
  if (date === today) return 'Dnes';
  if (date === addDays(today, 1)) return 'Zítra';
  return weekday;
}

/**
 * The next `dayCount` days that have something to show: a recurring stream, or
 * an exception (which can also add a stream on a normally free day).
 * Past days drop out on their own as `today` moves forward — never needs cleanup.
 */
export function getUpcomingDays(
  pattern: WeekPattern,
  exceptions: ScheduleException[],
  today: string,
  dayCount = 14,
): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  const tomorrow = addDays(today, 1);
  // Merge here rather than at the call site so no caller can forget to.
  const { merged } = mergeExceptions(exceptions);

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(today, offset);
    const asDate = toDate(date);
    const weekdayIndex = asDate.getUTCDay();
    const patternStart = pattern[DAY_KEYS[weekdayIndex]];
    const exception = merged.find((entry) => entry.date === date);

    if (!patternStart && !exception) continue;

    const cancelled = exception?.status === 'off';
    const timeUnknown = Boolean(exception?.timeUnknown) && !cancelled;

    days.push({
      date,
      weekday: DAY_NAMES[weekdayIndex],
      dayMonth: `${asDate.getUTCDate()}. ${asDate.getUTCMonth() + 1}.`,
      isToday: date === today,
      isTomorrow: date === tomorrow,
      streaming: !cancelled,
      // An explicit exception time always wins over the pattern.
      start: cancelled || timeUnknown ? undefined : (exception?.start ?? patternStart),
      note: exception?.note,
      game: exception?.game,
      isException: Boolean(exception),
      status: exception?.status,
      timeUnknown,
      highlight: Boolean(exception?.highlight),
      added: Boolean(exception) && !cancelled && !patternStart,
      timeChanged:
        Boolean(exception?.start) && Boolean(patternStart) && exception?.start !== patternStart,
    });
  }

  return days;
}

/**
 * Czech locative weekday for a date — 'v pátek', 've středu'. Lowercase so it
 * can sit mid-sentence.
 *
 * Deliberately a pure function of the date and not of "today": a page built
 * yesterday still labels the day correctly, where a baked-in "zítra" would be
 * a day out. Callers that want "dnes"/"zítra" compare the dates themselves.
 */
export function weekdayLocative(date: string): string {
  return DAY_LOCATIVE[toDate(date).getUTCDay()].toLowerCase();
}

/**
 * Czech day reference: "Dnes" / "Zítra" / "V pátek".
 *
 * Takes the two dates rather than a `ScheduleDay` so the browser can call it
 * with a live "today" — the banner sits on every page and a stale build would
 * otherwise announce "Dnes nestreamuju" about yesterday.
 */
export function dayReferenceFor(date: string, today: string): string {
  if (date === today) return 'Dnes';
  if (date === addDays(today, 1)) return 'Zítra';
  return DAY_LOCATIVE[toDate(date).getUTCDay()];
}

/**
 * Homepage banners, derived from the same data as the calendar — never authored
 * separately, so one exception entry drives both.
 *
 * Fires automatically only where a viewer would otherwise get it wrong: the
 * stream is off, the time moved, or the time is undecided. Anything else
 * (a bonus day, a programme swap, a note) is editorial and needs `highlight`,
 * so ordinary "which game today" entries don't hijack the top of the page.
 *
 * Returns every qualifying day in the next week, soonest first. They are
 * stacked rather than rotated: a carousel needs JavaScript and can be missed
 * entirely by anyone who looks away or reads slowly.
 */
export function getBanners(
  pattern: WeekPattern,
  exceptions: ScheduleException[],
  today: string,
): Banner[] {
  return getUpcomingDays(pattern, exceptions, today, 7)
    .filter((day) => day.status === 'off' || day.timeUnknown || day.timeChanged || day.highlight)
    .map((day) => {
      const when = dayReferenceFor(day.date, today);
      const rest = bannerRest(day);
      const base = { date: day.date, when, rest, label: `${when}${rest}` };

      // A highlighted day with nothing else changed says everything in `rest`
      // already — repeating the note as a detail would print it twice.
      if (isEditorialOnly(day)) return base;
      return { ...base, detail: day.note };
    });
}

/** Whether nothing changed mechanically and `highlight` alone put it here. */
function isEditorialOnly(day: ScheduleDay): boolean {
  return day.status !== 'off' && !day.timeUnknown && !day.added && !day.timeChanged;
}

/**
 * Everything after the day word, leading separator included, so the browser can
 * swap the day word without re-deriving the sentence.
 */
function bannerRest(day: ScheduleDay): string {
  if (day.status === 'off') return ' nestreamuju';
  if (day.timeUnknown) return ' streamuju, čas ještě nevím';
  if (day.added) return day.start ? ` bonusový stream od ${day.start}` : ' bonusový stream';
  if (day.timeChanged) return ` streamuju od ${day.start}`;

  // Highlighted with nothing else changed — the owner's own words carry it.
  const message = day.note ?? day.game;
  return message ? `: ${message}` : ' speciální stream';
}
