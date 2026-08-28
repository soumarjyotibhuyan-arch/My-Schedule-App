import { ScheduleEvent } from '../types';

export interface RealTimeContext {
  todayStr: string; // YYYY-MM-DD
  currentTimeStr: string; // HH:MM (24-hour format)
  nowTimestamp: number;
}

export function getRealTimeContext(): RealTimeContext {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');

  return {
    todayStr: `${yyyy}-${mm}-${dd}`,
    currentTimeStr: `${hh}:${min}`,
    nowTimestamp: d.getTime(),
  };
}

export type EventRealTimeStatus = 'past' | 'ongoing' | 'upcoming_today' | 'future';

export function getEventRealTimeStatus(
  event: ScheduleEvent,
  ctx: RealTimeContext = getRealTimeContext()
): EventRealTimeStatus {
  if (!event.date) {
    return 'upcoming_today';
  }

  const [eYear, eMonth, eDay] = event.date.split('-').map(x => parseInt(x, 10));
  const [tYear, tMonth, tDay] = ctx.todayStr.split('-').map(x => parseInt(x, 10));

  // Date comparison
  if (eYear < tYear) return 'past';
  if (eYear > tYear) return 'future';

  if (eMonth < tMonth) return 'past';
  if (eMonth > tMonth) return 'future';

  if (eDay < tDay) return 'past';
  if (eDay > tDay) return 'future';

  // Event is TODAY (eYear === tYear, eMonth === tMonth, eDay === tDay)
  const [eHour, eMinute] = event.time.split(':').map(x => parseInt(x, 10));
  const [cHour, cMinute] = ctx.currentTimeStr.split(':').map(x => parseInt(x, 10));

  const eventMins = eHour * 60 + eMinute;
  const currentMins = cHour * 60 + cMinute;

  // Class duration check
  const classDurationMins = 90;
  if (currentMins >= eventMins && currentMins < eventMins + classDurationMins) {
    return 'ongoing';
  }

  if (eventMins < currentMins) {
    return 'past';
  }

  return 'upcoming_today';
}

export interface BucketedEvents {
  pastEvents: ScheduleEvent[];
  todayEvents: ScheduleEvent[];
  futureEvents: ScheduleEvent[];
  ongoingEvent: ScheduleEvent | null;
  nextUpEvent: ScheduleEvent | null;
}

export function bucketScheduleEvents(
  events: ScheduleEvent[],
  ctx: RealTimeContext = getRealTimeContext()
): BucketedEvents {
  const pastEvents: ScheduleEvent[] = [];
  const todayEvents: ScheduleEvent[] = [];
  const futureEvents: ScheduleEvent[] = [];
  let ongoingEvent: ScheduleEvent | null = null;
  let nextUpEvent: ScheduleEvent | null = null;

  for (const event of events) {
    const status = getEventRealTimeStatus(event, ctx);
    if (status === 'past') {
      pastEvents.push(event);
    } else if (status === 'future') {
      futureEvents.push(event);
    } else {
      todayEvents.push(event);
      if (status === 'ongoing' && !ongoingEvent) {
        ongoingEvent = event;
      }
    }
  }

  const upcomingToday = todayEvents
    .filter(e => getEventRealTimeStatus(e, ctx) === 'upcoming_today')
    .sort((a, b) => a.time.localeCompare(b.time));

  if (upcomingToday.length > 0) {
    nextUpEvent = upcomingToday[0];
  } else if (futureEvents.length > 0) {
    const sortedFuture = [...futureEvents].sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return a.time.localeCompare(b.time);
    });
    nextUpEvent = sortedFuture[0];
  }

  return {
    pastEvents,
    todayEvents,
    futureEvents,
    ongoingEvent,
    nextUpEvent,
  };
}
