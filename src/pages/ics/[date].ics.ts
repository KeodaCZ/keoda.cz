/**
 * One .ics file per upcoming stream, generated at build time so the download
 * is a real static file rather than something assembled in the browser.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { endApprox, getUpcomingDays, timezone } from '../../lib/schedule';
import { icsBody, type CalendarEvent } from '../../lib/calendar-links';
import { streamEvent } from '../../lib/stream-event';

export const getStaticPaths = (() =>
  getUpcomingDays(14)
    // Cancelled days have nothing to add, and a day with no known time can't
    // become a calendar entry.
    .filter((day) => day.streaming && day.start)
    .map((day) => ({
      params: { date: day.date },
      props: { event: streamEvent(day, endApprox) },
    }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { event } = props as { event: CalendarEvent };
  return new Response(icsBody(event, timezone), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="keoda-${event.date}.ics"`,
    },
  });
};
