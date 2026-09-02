/** Binds the pure schedule logic to the committed JSON data files. */
import scheduleData from '../../data/schedule.json';
import exceptionsData from '../../data/exceptions.json';
import {
  getBanner as getBannerCore,
  getUpcomingDays as getUpcomingDaysCore,
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

export function todayInPrague(): string {
  return todayIn(timezone);
}

export function getUpcomingDays(dayCount = 14): ScheduleDay[] {
  return getUpcomingDaysCore(pattern, exceptions, todayInPrague(), dayCount);
}

export function getBanner(): Banner | null {
  return getBannerCore(pattern, exceptions, todayInPrague());
}
