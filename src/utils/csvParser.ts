import Papa from 'papaparse';
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

export function parseCSV(csvContent: string): ScheduleEvent[] {
  const parsed = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
  }) as any;

  const dataRows: any[][] = parsed.data || [];

  // Try to parse using the multi-session grid parser first
  const gridEvents = parseGridTimetable(dataRows);
  if (gridEvents) {
    return gridEvents;
  }

  const events: ScheduleEvent[] = [];
  let defaultHour = 9; // Fallback start hour for rows with no time

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.length === 0) continue;

    // Skip a header row if it contains descriptive words but no times/dates
    const hasHeaderSignature = row.some(cell => 
      /^(title|subject|class|time|date|day|description)$/i.test(cell?.toString().trim() || '')
    );
    const hasTimeSignature = row.some(cell => 
      formatTime(cell?.toString().trim() || '') !== null
    );
    // If it looks like a header (and doesn't contain a specific time value), skip it
    if (i === 0 && hasHeaderSignature && !hasTimeSignature) {
      continue;
    }

    let title = '';
    let timeStr = '';
    let rawTimeStr = '';
    let dayOrDateStr = '';
    let descriptionParts: string[] = [];
    let reminderMins = 5;

    for (const cell of row) {
      const val = (cell || '').toString().trim();
      if (!val) continue;

      // 1. Check if it matches a time
      const timeFormatted = formatTime(val);
      if (timeFormatted && !timeStr) {
        timeStr = timeFormatted;
        rawTimeStr = val;
        continue;
      }

      // 2. Check if it matches a day or date
      const cleanedVal = val.toLowerCase();
      if (DAYS_MAP[cleanedVal] !== undefined || /^\d{4}-\d{2}-\d{2}$/.test(cleanedVal)) {
        dayOrDateStr = val;
        continue;
      }

      // 3. Check if it matches a reminder (a low integer)
      if (/^\d+$/.test(val) && parseInt(val, 10) <= 60 && reminderMins === 5) {
        reminderMins = parseInt(val, 10);
        continue;
      }

      // 4. Otherwise, classify as title or description
      if (!title) {
        title = val;
      } else {
        descriptionParts.push(val);
      }
    }

    // Fallbacks to guarantee that the schedule item is created
    if (!title && descriptionParts.length > 0) {
      title = descriptionParts.shift() || '';
    }
    if (!title) {
      title = 'Blank';
    }

    const category = classifyEventCategory(title);

    if (!timeStr) {
      // Dynamic cognitive-load routing if no time is provided
      timeStr = getDefaultTimeForCategory(category);
    }

    const event: ScheduleEvent = {
      id: Math.random().toString(36).substring(2, 9),
      title: title.trim(),
      time: timeStr,
      reminderMinutesBefore: reminderMins,
      category,
      rawTime: rawTimeStr || undefined,
    };

    if (descriptionParts.length > 0) {
      event.description = descriptionParts.join(' - ').trim();
    }

    // Parse Day or Date
    const cleanedDayDate = dayOrDateStr.trim().toLowerCase();
    if (DAYS_MAP[cleanedDayDate] !== undefined) {
      event.dayOfWeek = DAYS_MAP[cleanedDayDate];
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedDayDate)) {
      event.date = cleanedDayDate;
    } else {
      // Best effort date parse
      const parsedDate = Date.parse(cleanedDayDate);
      if (!isNaN(parsedDate)) {
        const d = new Date(parsedDate);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        event.date = `${yyyy}-${mm}-${dd}`;
      } else {
        // Fallback to Monday (1) to guarantee repetition or today
        event.dayOfWeek = 1;
      }
    }

    events.push(event);
  }

  return events;
}

// Formats diverse time inputs to "HH:MM" 24h format
function formatTime(timeStr: string): string | null {
  let cleaned = timeStr.trim().toLowerCase();
  
  const originalHasPm = timeStr.toLowerCase().includes('pm');
  const originalHasAm = timeStr.toLowerCase().includes('am');

  // 1. Handle ranges (e.g. "09:30 - 10:30", "10:00 to 11:30", "10-11:30")
  const rangeDelimiter = cleaned.match(/[-/]|(\bto\b)/);
  if (rangeDelimiter) {
    let firstPart = cleaned.split(rangeDelimiter[0])[0].trim();
    if (firstPart) {
      // Append am/pm context if it was lost in split
      if (originalHasPm && !firstPart.includes('pm') && !firstPart.includes('am')) {
        firstPart += ' pm';
      } else if (originalHasAm && !firstPart.includes('pm') && !firstPart.includes('am')) {
        firstPart += ' am';
      }
      cleaned = firstPart;
    }
  }

  // 2. Normalize dots (e.g., "9.30" -> "9:30")
  cleaned = cleaned.replace(/(\d{1,2})\.(\d{2})/g, '$1:$2');

  // 3. Match 12-hour format with AM/PM (e.g., "02:30 pm", "9am", "11 am")
  const ampmRegex = /(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)/i;
  const ampmMatch = cleaned.match(ampmRegex);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[4].toLowerCase() === 'pm';

    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // 4. Match standard 24-hour time (e.g., "14:30", "09:15:30", "8:00")
  const standardRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))/;
  const standardMatch = cleaned.match(standardRegex);
  if (standardMatch) {
    const hours = parseInt(standardMatch[1], 10);
    const minutes = parseInt(standardMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // 5. Match military time (e.g., "1300", "0930")
  const militaryRegex = /\b(\d{2})(\d{2})\b/;
  const militaryMatch = cleaned.match(militaryRegex);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const minutes = parseInt(militaryMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // 6. Match a single hour (e.g., "9" -> "09:00") if it's purely numerical
  const singleHourRegex = /^\b(\d{1,2})\b$/;
  const singleMatch = cleaned.match(singleHourRegex);
  if (singleMatch) {
    const hours = parseInt(singleMatch[1], 10);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00`;
    }
  }

  return null;
}
