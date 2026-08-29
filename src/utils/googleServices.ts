import { ScheduleEvent } from '../types';
import { Linking, Platform } from 'react-native';

/**
 * 1. Google Calendar Integration:
 * Generates direct Google Calendar Web Create Event URL for a single schedule event.
 */
export function generateGoogleCalendarUrl(event: ScheduleEvent): string {
  const title = encodeURIComponent(event.title);
  const details = encodeURIComponent(
    `Class Schedule Event\nInstructor: ${event.faculty || 'N/A'}\nVenue: ${event.venue || 'N/A'}\nCategory: ${event.category || 'General'}`
  );
  const location = encodeURIComponent(event.venue || 'Campus Classroom');

  // Format dates for Google Calendar API (YYYYMMDDTHHmmssZ)
  let dateStr = event.date;
  if (!dateStr) {
    const today = new Date();
    dateStr = today.toISOString().split('T')[0];
  }

  const [year, month, day] = dateStr.split('-').map(x => parseInt(x, 10));
  const [hourStr, minuteStr] = event.time.split(':');
  const startHour = parseInt(hourStr, 10);
  const startMinute = parseInt(minuteStr, 10);

  // End time 90 minutes after start time
  const startDate = new Date(year, month - 1, day, startHour, startMinute, 0);
  const endDate = new Date(startDate.getTime() + 90 * 60000);

  const formatIsoUtc = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const datesParam = `${formatIsoUtc(startDate)}/${formatIsoUtc(endDate)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}&location=${location}&sf=true&output=xml`;
}

/**
 * Open single event in Google Calendar.
 */
export function openInGoogleCalendar(event: ScheduleEvent): void {
  const url = generateGoogleCalendarUrl(event);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url);
  }
}

export function generateICSContent(events: ScheduleEvent[]): string {
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RoutineSync//Google Calendar Sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:My Coursework Timetable'
  ];

  const formatIsoUtc = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '');
  };

  for (const event of events) {
    let dateStr = event.date;
    if (!dateStr) continue;

    const [year, month, day] = dateStr.split('-').map(x => parseInt(x, 10));
    const [hourStr, minuteStr] = event.time.split(':');
    const startHour = parseInt(hourStr, 10);
    const startMinute = parseInt(minuteStr, 10);

    const startDate = new Date(year, month - 1, day, startHour, startMinute, 0);
    const endDate = new Date(startDate.getTime() + 90 * 60000);

    ics.push('BEGIN:VEVENT');
    ics.push(`UID:${event.id}@routinesync.com`);
    ics.push(`DTSTAMP:${formatIsoUtc(new Date())}`);
    ics.push(`DTSTART:${formatIsoUtc(startDate)}`);
    ics.push(`DTEND:${formatIsoUtc(endDate)}`);
    ics.push(`SUMMARY:${event.title}`);
    ics.push(`DESCRIPTION:Instructor: ${event.faculty || 'N/A'}\\nCategory: ${event.category || 'General'}`);
    if (event.venue) {
      ics.push(`LOCATION:${event.venue}`);
    }
    ics.push('STATUS:CONFIRMED');
    ics.push('END:VEVENT');
  }

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

export function downloadGoogleCalendarICS(events: ScheduleEvent[]): void {
  const content = generateICSContent(events);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'RoutineSync_Google_Calendar.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function generateGoogleMapsUrl(venueStr?: string): string {
  const query = venueStr ? encodeURIComponent(venueStr) : encodeURIComponent('Campus Classroom');
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function openInGoogleMaps(venueStr?: string): void {
  const url = generateGoogleMapsUrl(venueStr);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url);
  }
}
