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

export type ExceptionStatus = 'off' | 'moved';

/** Weekday key -> start time ('18:30'). Missing key means no stream that day. */
export type WeekPattern = Record<string, string | undefined>;

export interface ScheduleException {
  date: string;
  status?: ExceptionStatus;
  /** Overrides the weekly pattern's time — e.g. a moved stream at '21:00'. */
  start?: string;
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
  /** Absent when cancelled, or when moved without an explicit new time. */
  start?: string;
  note?: string;
  game?: string;
  isException: boolean;
  /** The exception's own status, so callers don't have to re-derive it. */
  status?: ExceptionStatus;
  /** True when an exception put a stream on a normally free day. */
  added: boolean;
}

export interface Banner {
  label: string;
  detail?: string;
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

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(today, offset);
    const asDate = toDate(date);
    const weekdayIndex = asDate.getUTCDay();
    const patternStart = pattern[DAY_KEYS[weekdayIndex]];
    const exception = exceptions.find((entry) => entry.date === date);

    if (!patternStart && !exception) continue;

    const cancelled = exception?.status === 'off';
    const moved = exception?.status === 'moved';

    days.push({
      date,
      weekday: DAY_NAMES[weekdayIndex],
      dayMonth: `${asDate.getUTCDate()}. ${asDate.getUTCMonth() + 1}.`,
      isToday: date === today,
      isTomorrow: date === tomorrow,
      streaming: !cancelled,
      // An explicit exception time always wins. A moved stream without one
      // falls back to no time at all, since the pattern time is now wrong.
      start: cancelled ? undefined : (exception?.start ?? (moved ? undefined : patternStart)),
      note: exception?.note,
      game: exception?.game,
      isException: Boolean(exception),
      status: exception?.status,
      added: Boolean(exception) && !cancelled && !patternStart,
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
 * Homepage banner, derived from the same data as the calendar — never authored
 * separately, so one exception entry drives both. Surfaces the soonest
 * cancelled or moved stream within a week.
 */
export function getBanner(
  pattern: WeekPattern,
  exceptions: ScheduleException[],
  today: string,
): Banner | null {
  // Only actual changes to the plan are worth a banner. An exception that just
  // names the game on a regular day is not news.
  const soon = getUpcomingDays(pattern, exceptions, today, 7).find(
    (day) => day.status === 'off' || day.status === 'moved' || day.added,
  );
  if (!soon) return null;

  const when = dayReference(soon);
  const detail = soon.note;

  if (soon.status === 'off') return { label: `${when} nestreamuju`, detail };

  if (soon.added) {
    return {
      label: soon.start ? `${when} bonusový stream od ${soon.start}` : `${when} bonusový stream`,
      detail,
    };
  }

  return {
    label: soon.start ? `${when} streamuju od ${soon.start}` : `${when} streamuju jinak`,
    detail,
  };
}
