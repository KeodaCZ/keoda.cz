/** Binds the pure schedule logic to the committed JSON data files. */
import scheduleData from '../../data/schedule.json';
import exceptionsData from '../../data/exceptions.json';
import {
  getBanners as getBannersCore,
  getUpcomingDays as getUpcomingDaysCore,
  mergeExceptions,
  todayIn,
  type Banner,
  type ScheduleDay,
  type ScheduleException,
  type WeekPattern,
} from './schedule-core';

export type { Banner, ScheduleDay };

export const timezone: string = scheduleData.timezone || 'Europe/Prague';
/** Approximate end time, used only for calendar exports — the site itself
 *  never renders a hard end time. */
export const endApprox: string = scheduleData.endApprox || '23:00';
const pattern = scheduleData.days as WeekPattern;
// The list is wrapped in an object because Sveltia CMS edits named fields,
// not a bare top-level array.
const exceptions = (exceptionsData.exceptions ?? []) as ScheduleException[];

export const scheduleNote: string | undefined = scheduleData.note;

// Two entries for one date are almost always a slip in the CMS. They get
// merged rather than dropped, but say so loudly in the build log — the deploy
// must not fail over this, or a last-minute cancellation would never publish.
const { duplicates } = mergeExceptions(exceptions);
if (duplicates.length > 0) {
  const detail = duplicates.map((d) => `${d.date} (${d.count}×)`).join(', ');
  console.warn(
    `\n⚠  data/exceptions.json: více záznamů pro stejné datum — ${detail}.\n` +
      `   Sloučeno do jednoho, pozdější údaje přebily dřívější.\n` +
      `   Zkontroluj to v /admin a nech u každého dne jen jeden záznam.\n`,
  );
}

export function todayInPrague(): string {
  return todayIn(timezone);
}

export function getUpcomingDays(dayCount = 14): ScheduleDay[] {
  return getUpcomingDaysCore(pattern, exceptions, todayInPrague(), dayCount);
}

export function getBanners(): Banner[] {
  return getBannersCore(pattern, exceptions, todayInPrague());
}
