import { ScheduleEvent } from '../types';
import { classifyEventCategory } from './categorizer';

const DAYS_MAP: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7
};

function parseTimeTo24h(timeStr: string): string | null {
  const cleaned = timeStr.trim().toLowerCase();
  const match = cleaned.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/);
  if (!match) {
    const singleMatch = cleaned.match(/\b(\d{1,2})\s*(am|pm)\b/);
    if (singleMatch) {
      let hours = parseInt(singleMatch[1], 10);
      const ampm = singleMatch[2];
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:00`;
    }
    return null;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];
  
  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function parseGridTimetable(rows: any[][]): ScheduleEvent[] | null {
  let headerRowIndex = -1;
  let dateColIndex = -1;
  let dayColIndex = -1;
  
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!row) continue;
    
    let hasDate = false;
    let hasDay = false;
    let hasSubject = false;
    let hasFaculty = false;
    
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim().toLowerCase();
      if (cellVal === 'date') {
        hasDate = true;
        dateColIndex = c;
      } else if (cellVal === 'day') {
        hasDay = true;
        dayColIndex = c;
      } else if (cellVal === 'subject') {
        hasSubject = true;
      } else if (cellVal === 'faculty') {
        hasFaculty = true;
      }
    }
    
    if (hasDate && hasDay && (hasSubject || hasFaculty)) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return null; 
  }

  const timingMap: Record<string, string[]> = {
    saturday: [],
    sunday: [],
    weekday: []
  };

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const firstCell = String(row[0] || '').trim().toLowerCase();
    const secondCell = String(row[1] || '').trim().toLowerCase();
    
    if (firstCell.includes('timing') || secondCell.includes('timing') || firstCell.includes('session') || secondCell.includes('session')) {
      let sessionIndex = -1;
      
      for (const cell of row) {
        const val = String(cell || '').trim();
        const sessMatch = val.match(/Session\s*(\d+)/i);
        if (sessMatch) {
          sessionIndex = parseInt(sessMatch[1], 10) - 1;
          break;
        }
      }
      
      if (sessionIndex !== -1) {
        const timeRanges: string[] = [];
        for (const cell of row) {
          const val = String(cell || '').trim();
          if (/\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/i.test(val)) {
            timeRanges.push(val);
          }
        }
        
        if (timeRanges.length >= 2) {
          timingMap.saturday[sessionIndex] = timeRanges[0];
          timingMap.sunday[sessionIndex] = timeRanges[1];
        } else if (timeRanges.length === 1) {
          timingMap.weekday[sessionIndex] = timeRanges[0];
          timingMap.saturday[sessionIndex] = timeRanges[0];
          timingMap.sunday[sessionIndex] = timeRanges[0];
        }
      }
    }
  }

  const defaultSatTimings = ['9.00 am to 11.00 am', '11.00 am to 01.00 pm', '2:00 pm to 4:00 pm'];
  const defaultSunTimings = ['10:30 am - 12:15 pm', '12:15 pm - 02:00 pm', '02:45 pm - 4:30 pm'];

  const events: ScheduleEvent[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const dateVal = String(row[dateColIndex] || '').trim();
    const dayVal = String(row[dayColIndex] || '').trim();

    if (!dateVal || !dayVal) continue;
    if (dateVal.toLowerCase().includes('timing') || dateVal.toLowerCase().includes('session') || dateVal.toLowerCase().includes('class')) continue;

    const cleanedDay = dayVal.toLowerCase();
    if (DAYS_MAP[cleanedDay] === undefined) {
      continue; 
    }

    const isSaturday = cleanedDay.includes('sat');
    const isSunday = cleanedDay.includes('sun');
    const dayType = isSaturday ? 'saturday' : (isSunday ? 'sunday' : 'weekday');

    let parsedDateStr: string | undefined;
    let parsedDayOfWeek: number = DAYS_MAP[cleanedDay];
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      parsedDateStr = dateVal;
    } else {
      const ts = Date.parse(dateVal.replace(/-/g, ' '));
      if (!isNaN(ts)) {
        const d = new Date(ts);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        parsedDateStr = `${yyyy}-${mm}-${dd}`;
      }
    }

    let sessionCount = 0;
    for (let c = Math.max(dateColIndex, dayColIndex) + 1; c < row.length; c += 2) {
      if (c >= row.length) break;
      
      const subjectVal = String(row[c] || '').trim();
      const facultyVal = String(row[c + 1] || '').trim();

      const isHoliday = subjectVal.toLowerCase().includes('holiday') || subjectVal.toLowerCase().includes('independance');

      const sessIdx = sessionCount;
      sessionCount++;

      let rawTimeRange = '';
      if (dayType === 'saturday') {
        rawTimeRange = timingMap.saturday[sessIdx] || defaultSatTimings[sessIdx] || '09:00 - 11:00';
      } else if (dayType === 'sunday') {
        rawTimeRange = timingMap.sunday[sessIdx] || defaultSunTimings[sessIdx] || '10:30 - 12:15';
      } else {
        rawTimeRange = timingMap.weekday[sessIdx] || '09:00 - 11:00';
      }

      const timeParts = rawTimeRange.split(/(?:to|-)/i);
      const startTimeRaw = timeParts[0] || '09:00';
      const formattedTime = parseTimeTo24h(startTimeRaw) || '09:00';

      let title = '';
      let desc = '';

      if (isHoliday) {
        title = subjectVal;
        desc = facultyVal;
      } else {
        title = subjectVal || 'Blank'; 
        desc = facultyVal;
      }

      if (isHoliday && events.some(e => e.title === title && (e.date === parsedDateStr || e.dayOfWeek === parsedDayOfWeek))) {
        continue;
      }

      if (!isHoliday && events.some(e => e.title.toLowerCase().includes('holiday') && (e.date === parsedDateStr || e.dayOfWeek === parsedDayOfWeek))) {
        continue;
      }

      const category = classifyEventCategory(title);

      const event: ScheduleEvent = {
        id: Math.random().toString(36).substring(2, 9),
        title,
        time: formattedTime,
        reminderMinutesBefore: 5,
        category,
        rawTime: rawTimeRange,
      };

      if (desc) {
        event.description = desc;
      }

      if (parsedDateStr) {
        event.date = parsedDateStr;
      } else {
        event.dayOfWeek = parsedDayOfWeek;
      }

      events.push(event);
    }
  }

  return events.length > 0 ? events : null;
}
