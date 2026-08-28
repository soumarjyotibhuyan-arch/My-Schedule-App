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

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function parseStructuredDate(rawStr: string, fallbackYear: string = '2026'): string | undefined {
  const str = rawStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Check for DD-MMM-YY e.g. 19-Sep-26 or 19-Sep-2026
  const dashMatch = str.match(/^(\d{1,2})[-/\.]([A-Za-z]{3,9})[-/\.](\d{2,4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const mStr = dashMatch[2].toLowerCase();
    let yr = dashMatch[3];
    if (yr.length === 2) yr = `20${yr}`;
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Check for DD Month YYYY or DD Month e.g. "13 July" or "11 July 2026"
  const spaceMatch = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?$/);
  if (spaceMatch) {
    const day = parseInt(spaceMatch[1], 10);
    const mStr = spaceMatch[2].toLowerCase();
    const yr = spaceMatch[3] || fallbackYear;
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Fallback to JS Date.parse
  let cleanDate = str.replace(/[\/\.]/g, ' ').trim();
  if (!/\b20\d{2}\b/.test(cleanDate)) {
    cleanDate += ` ${fallbackYear}`;
  }
  const ts = Date.parse(cleanDate);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return undefined;
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

  // Extract cohort year from title rows (default to 2026)
  let cohortYear = '2026';
  for (let r = 0; r <= headerRowIndex; r++) {
    const rowStr = (rows[r] || []).join(' ');
    const yearMatch = rowStr.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      cohortYear = yearMatch[1];
      break;
    }
  }

  // Check row directly above header for column time ranges (e.g. 09.00 AM to 11.00 AM)
  const colTimeRanges: Record<number, string> = {};
  if (headerRowIndex > 0) {
    for (let r = Math.max(0, headerRowIndex - 2); r < headerRowIndex; r++) {
      const timeRow = rows[r] || [];
      for (let c = 0; c < timeRow.length; c++) {
        const val = String(timeRow[c] || '').trim();
        if (/\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?\b/i.test(val)) {
          colTimeRanges[c] = val;
        }
      }
    }
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

    const parsedDateStr = parseStructuredDate(dateVal, cohortYear);
    const parsedDayOfWeek: number = DAYS_MAP[cleanedDay];

    const defaultWeekdayTimings = ['9.00 am to 11.00 am', '11.00 am to 01.00 pm', '2:00 pm to 4:00 pm'];
    const defaultSatTimings = ['9.00 am to 11.00 am', '11.00 am to 01.00 pm', '2:00 pm to 4:00 pm'];
    const defaultSunTimings = ['10:30 am - 12:15 pm', '12:15 pm - 02:00 pm', '02:45 pm - 4:30 pm'];

    let sessionCount = 0;
    for (let c = Math.max(dateColIndex, dayColIndex) + 1; c < row.length; c += 2) {
      if (c >= row.length) break;
      
      const subjectVal = String(row[c] || '').trim();
      const facultyVal = String(row[c + 1] || '').trim();

      // Skip completely empty session slots
      if (!subjectVal && !facultyVal) {
        sessionCount++;
        continue;
      }

      const sessIdx = sessionCount;
      sessionCount++;

      let defaultRawTime = colTimeRanges[c] || colTimeRanges[c - 1] || '';
      if (!defaultRawTime) {
        if (dayType === 'saturday') {
          defaultRawTime = timingMap.saturday[sessIdx] || defaultSatTimings[sessIdx] || '09:00 - 11:00';
        } else if (dayType === 'sunday') {
          defaultRawTime = timingMap.sunday[sessIdx] || defaultSunTimings[sessIdx] || '10:30 - 12:15';
        } else {
          defaultRawTime = timingMap.weekday[sessIdx] || defaultWeekdayTimings[sessIdx] || '09:00 - 11:00';
        }
      }

      // Helper to process a cell string into one or more ScheduleEvents
      const processCellText = (rawText: string, defaultTime: string, partnerText: string = '') => {
        if (!rawText || rawText.length < 2) return;

        const combinedText = `${rawText} ${partnerText}`.trim();
        const isHoliday = rawText.toLowerCase().includes('holiday') || rawText.toLowerCase().includes('independance');
        const inTextMatch = rawText.match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\b/i);

        let eventRawTime = defaultTime;
        if (inTextMatch) {
          eventRawTime = inTextMatch[1];
        }

        const timeParts = eventRawTime.split(/(?:to|-)/i);
        const startTimeRaw = timeParts[0] || '09:00';
        const formattedTime = parseTimeTo24h(startTimeRaw) || '09:00';

        // Extract Venue
        let venue: string | undefined;
        const venueMatch = combinedText.match(/\b(?:Venue|Room)\s*[:\-]?\s*([^,\n\)]+)/i);
        if (venueMatch) {
          venue = `Venue: ${venueMatch[1].trim()}`;
        }

        // Extract Faculty / Instructor
        let faculty: string | undefined;
        const facultyMatch = combinedText.match(/\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+[A-Za-z\s]+?)(?=\s*\(|\s*,|\s*Venue|\s*$)/i);
        if (facultyMatch) {
          faculty = facultyMatch[1].trim();
        } else if (partnerText && !/\b\d{1,2}[:.]\d{2}\b/.test(partnerText)) {
          faculty = partnerText.replace(/\bVenue\s*:.*$/i, '').trim();
        }

        // Clean Title
        let cleanTitle = rawText;
        cleanTitle = cleanTitle.replace(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/gi, '');
        cleanTitle = cleanTitle.replace(/\bVenue\s*:[^,\)]+/gi, '');
        cleanTitle = cleanTitle.replace(/[,;:\-_|]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleanTitle || cleanTitle.length < 2) cleanTitle = rawText;

        const category = classifyEventCategory(cleanTitle);

        // Deduplication check
        const isDuplicate = events.some(e => 
          (e.title.toLowerCase() === cleanTitle.toLowerCase() || e.rawTime === eventRawTime) &&
          e.time === formattedTime &&
          (e.date === parsedDateStr || e.dayOfWeek === parsedDayOfWeek)
        );

        if (isDuplicate) return;

        const eventItem: ScheduleEvent = {
          id: Math.random().toString(36).substring(2, 9),
          title: cleanTitle,
          time: formattedTime,
          reminderMinutesBefore: 5,
          category,
          rawTime: eventRawTime,
          venue: venue || (partnerText.toLowerCase().includes('venue') ? partnerText : undefined),
          faculty: faculty || undefined,
        };

        if (partnerText && partnerText !== rawText && !/\b\d{1,2}[:.]\d{2}\b/.test(partnerText)) {
          eventItem.description = partnerText;
        }

        if (parsedDateStr) {
          eventItem.date = parsedDateStr;
          eventItem.dayOfWeek = parsedDayOfWeek;
        } else {
          eventItem.dayOfWeek = parsedDayOfWeek;
        }

        events.push(eventItem);
      };

      const isFacultyText = (str: string) => {
        const s = str.trim();
        if (/^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i.test(s)) return true;
        if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]{1,3}(?:\s*\(.*?\))?$/.test(s)) return true;
        return false;
      };

      let partnerFaculty = facultyVal;
      if (!partnerFaculty && c + 3 < row.length) {
        const candidate = String(row[c + 2] || row[c + 3] || '').trim();
        if (isFacultyText(candidate)) {
          partnerFaculty = candidate;
        }
      }

      const subjHasTime = /\b\d{1,2}[:.]\d{2}\b/.test(subjectVal);
      const facHasTime = /\b\d{1,2}[:.]\d{2}\b/.test(facultyVal);

      if (subjHasTime && facHasTime) {
        // Both subject and faculty cells contain separate class sessions
        processCellText(subjectVal, defaultRawTime);
        processCellText(facultyVal, defaultRawTime);
      } else if (subjHasTime) {
        processCellText(subjectVal, defaultRawTime, partnerFaculty);
      } else if (facHasTime) {
        processCellText(facultyVal, defaultRawTime, partnerFaculty);
      } else {
        // Standard subject + faculty pair
        processCellText(subjectVal || facultyVal, defaultRawTime, partnerFaculty !== subjectVal ? partnerFaculty : '');
      }
    }
  }

  // Chronological Sorting Logic: Primary by Date, Secondary by Time
  events.sort((a, b) => {
    if (a.date && b.date) {
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
    }
    return a.time.localeCompare(b.time);
  });

  return events.length > 0 ? events : null;
}
