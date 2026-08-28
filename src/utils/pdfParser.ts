import { ScheduleEvent } from '../types';
import { classifyEventCategory, getDefaultTimeForCategory } from './categorizer';
import { parseGridTimetable } from './gridParser';

const DAYS_MAP: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7
};

export function parsePDFText(text: string): ScheduleEvent[] {
  const lines = text.split('\n');

  // Pass 0: Attempt grid timetable parsing for structured PDF tables
  const splitDelimiters = [/\t|\||\s{2,}/, /,/, /;/];
  for (const delim of splitDelimiters) {
    const rows = lines
      .map(line => line.split(delim).map(cell => cell.trim()))
      .filter(row => row.some(cell => cell.length > 0));
    
    const gridResult = parseGridTimetable(rows);
    if (gridResult && gridResult.length > 0) {
      return gridResult;
    }
  }

  const events: ScheduleEvent[] = [];
  
  let lastSeenDayOrDate: { dayOfWeek?: number; date?: string } = {};

  const timeRegex = /\b(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?\b/i;
  const dateRegex = /\b(\d{4}-\d{2}-\d{2})\b/;

  // Pass 1: Parse lines that contain explicit times
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for days/dates to keep track of context
    let lineDayOfWeek: number | undefined;
    for (const [dayName, val] of Object.entries(DAYS_MAP)) {
      const regex = new RegExp(`\\b${dayName}\\b`, 'i');
      if (regex.test(trimmed)) {
        lineDayOfWeek = val;
        break;
      }
    }

    const dateMatch = trimmed.match(dateRegex);
    let lineDate: string | undefined;
    if (dateMatch) {
      lineDate = dateMatch[1];
    }

    if (lineDayOfWeek !== undefined) {
      lastSeenDayOrDate = { dayOfWeek: lineDayOfWeek };
    } else if (lineDate !== undefined) {
      lastSeenDayOrDate = { date: lineDate };
    }

    const timeMatch = trimmed.match(timeRegex);
    if (timeMatch) {
      const matchedTimeStr = timeMatch[0];
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      let hour24 = hours;
      if (ampm === 'pm' && hours < 12) hour24 += 12;
      if (ampm === 'am' && hours === 12) hour24 = 0;

      const formattedTime = `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      // Clean title
      let title = trimmed.replace(timeRegex, '').replace(dateRegex, '');
      for (const dayName of Object.keys(DAYS_MAP)) {
        const regex = new RegExp(`\\b${dayName}\\b`, 'gi');
        title = title.replace(regex, '');
      }

      title = title.replace(/[,;:\-_|]/g, ' ').replace(/\s+/g, ' ').trim();

      if (!title || title.length < 2) {
        title = "Blank";
      }

      let reminderMinutes = 5;
      const reminderMatch = trimmed.match(/\b(?:remind|reminder|offset)?\s*(\d+)\s*(?:min|mins|m|minute|minutes)\b/i);
      if (reminderMatch) {
        reminderMinutes = parseInt(reminderMatch[1], 10);
      }

      const eventDayOfWeek = lineDayOfWeek ?? lastSeenDayOrDate.dayOfWeek;
      const eventDate = lineDate ?? lastSeenDayOrDate.date;

      const event: ScheduleEvent = {
        id: Math.random().toString(36).substring(2, 9),
        title,
        time: formattedTime,
        reminderMinutesBefore: reminderMinutes,
        category: classifyEventCategory(title),
        rawTime: matchedTimeStr,
      };

      if (eventDayOfWeek !== undefined) {
        event.dayOfWeek = eventDayOfWeek;
      } else if (eventDate !== undefined) {
        event.date = eventDate;
      } else {
        event.dayOfWeek = 1; // Fallback to Monday
      }

      events.push(event);
    }
  }

  // Pass 2 Fallback: If no events were found (e.g. no time matches anywhere in the file)
  // we parse each descriptive line and assign sequential hours starting from 9:00 AM.
  if (events.length === 0) {
    let defaultHour = 9;
    let currentDayOfWeek = 1; // Start with Monday

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip empty lines, page headers, or single-character noise
      if (!trimmed || trimmed.length <= 3) continue;
      if (/^(page|timetable|schedule|daily|weekly|month|year|date)$/i.test(trimmed)) continue;

      // Extract day if present in line
      let lineDayOfWeek = currentDayOfWeek;
      for (const [dayName, val] of Object.entries(DAYS_MAP)) {
        const regex = new RegExp(`\\b${dayName}\\b`, 'i');
        if (regex.test(trimmed)) {
          lineDayOfWeek = val;
          break;
        }
      }

      // Clean title
      let title = trimmed;
      for (const dayName of Object.keys(DAYS_MAP)) {
        const regex = new RegExp(`\\b${dayName}\\b`, 'gi');
        title = title.replace(regex, '');
      }
      title = title.replace(/[,;:\-_|]/g, ' ').replace(/\s+/g, ' ').trim();

      if (!title || title.length <= 2) {
        continue; // Skip lines with no substantive text left
      }

      const category = classifyEventCategory(title);
      const event: ScheduleEvent = {
        id: Math.random().toString(36).substring(2, 9),
        title,
        time: getDefaultTimeForCategory(category),
        reminderMinutesBefore: 5,
        dayOfWeek: lineDayOfWeek,
        category,
      };

      events.push(event);
      defaultHour += 1;
      // Cycle days of the week if we have many events
      if (defaultHour >= 18) {
        defaultHour = 9;
        currentDayOfWeek = (currentDayOfWeek % 7) + 1;
      }
    }
  }

  return events;
}
