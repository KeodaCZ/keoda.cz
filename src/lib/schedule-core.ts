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

function addDays(iso: string, amount: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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

/** Czech day reference: "Dnes" / "Zítra" / "V pátek". */
function dayReference(day: ScheduleDay): string {
  if (day.isToday) return 'Dnes';
  if (day.isTomorrow) return 'Zítra';
  return DAY_LOCATIVE[toDate(day.date).getUTCDay()];
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
      const when = dayReference(day);
      const detail = day.note;

      if (day.status === 'off') return { label: `${when} nestreamuju`, detail };

      if (day.timeUnknown) return { label: `${when} streamuju, čas ještě nevím`, detail };

      if (day.added) {
        return {
          label: day.start ? `${when} bonusový stream od ${day.start}` : `${when} bonusový stream`,
          detail,
        };
      }

      if (day.timeChanged) return { label: `${when} streamuju od ${day.start}`, detail };

      // Highlighted with nothing else changed — the owner's own words carry it.
      const message = day.note ?? day.game;
      return { label: message ? `${when}: ${message}` : `${when} speciální stream` };
    });
}
