/**
 * Turns a schedule day into a calendar event. Shared by the .ics endpoint and
 * the Google Calendar links so both always describe the same thing.
 */
import type { ScheduleDay } from './schedule-core';
import type { CalendarEvent } from './calendar-links';

export const TWITCH_URL = 'https://www.twitch.tv/keodacz';

export function streamEvent(day: ScheduleDay, endApprox: string): CalendarEvent {
  const detail = day.note ? `${day.note}. ` : '';
  return {
    date: day.date,
    // Callers filter these out, but keep the fallback honest rather than
    // silently inventing a time.
    start: day.start ?? '',
    end: endApprox,
    title: day.game ? `KeodaCZ — ${day.game}` : 'Stream KeodaCZ',
    description: `${detail}Časy jsou přibližné, konec je jen odhad.`,
    url: TWITCH_URL,
  };
}
