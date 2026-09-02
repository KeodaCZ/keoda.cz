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

const timezone = scheduleData.timezone || 'Europe/Prague';
const pattern = scheduleData.days as WeekPattern;
const exceptions = exceptionsData as ScheduleException[];

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
