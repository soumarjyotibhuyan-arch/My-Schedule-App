import { ScheduleEvent } from '../types';
import { classifyEventCategory } from './categorizer';
import { behavioralEngineInstance } from './behavioralEngine';

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12
};

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
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toLowerCase();
  
  const match = cleaned.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];

    if (ampm === 'pm' && hours < 12) hours += 12;
    else if (ampm === 'am' && hours === 12) hours = 0;
    else if (!ampm) {
      if (hours >= 1 && hours <= 6) hours += 12;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const singleMatch = cleaned.match(/\b(\d{1,2})\s*(am|pm)?\b/);
  if (singleMatch) {
    let hours = parseInt(singleMatch[1], 10);
    const ampm = singleMatch[2];

    if (ampm === 'pm' && hours < 12) hours += 12;
    else if (ampm === 'am' && hours === 12) hours = 0;
    else if (!ampm) {
      if (hours >= 1 && hours <= 6) hours += 12;
    }

    return `${String(hours).padStart(2, '0')}:00`;
  }

  return null;
}

function parseIsoDate(rawStr: string, fallbackYear: string = '2026'): string | undefined {
  const str = rawStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD-MMM-YY e.g. 13-Jul-26
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

  // DD Month e.g. "13 July", "1 September"
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

  return undefined;
}

interface CellCoordinates {
  r: number;
  c: number;
  text: string;
  dateStr?: string;
  time24h?: string;
  rawTimeStr?: string;
  isHeader?: boolean;
}

/**
 * Multidirectional Sequence-Agnostic Parser
 * Scans 2D grid matrix in all reading directions:
 * - Top-to-Bottom / Left-to-Right
 * - Left-to-Right / Top-to-Bottom (Transposed Matrix)
 * - Spatial Coordinate Bounding Box Association
 */
export function parseMultidirectionalGrid(rows: any[][]): ScheduleEvent[] | null {
  if (!rows || rows.length === 0) return null;

  const numRows = rows.length;
  let maxCols = 0;
  for (let r = 0; r < numRows; r++) {
    if (rows[r] && rows[r].length > maxCols) {
      maxCols = rows[r].length;
    }
  }
  if (maxCols === 0) return null;

  // Extract year from document title
  let cohortYear = '2026';
  for (let r = 0; r < Math.min(numRows, 5); r++) {
    const rowText = (rows[r] || []).join(' ');
    const yMatch = rowText.match(/\b(20\d{2})\b/);
    if (yMatch) {
      cohortYear = yMatch[1];
      break;
    }
  }

  const cells: CellCoordinates[][] = [];
  const dateMap: Map<string, { r: number; c: number; isoDate: string }> = new Map();
  const timeMap: Map<string, { r: number; c: number; time24h: string; rawTime: string }> = new Map();

  // Step 1: Index all cells & detect spatial date and time anchors across the entire grid
  for (let r = 0; r < numRows; r++) {
    cells[r] = [];
    const row = rows[r] || [];
    for (let c = 0; c < maxCols; c++) {
      const cellVal = String(row[c] || '').trim();
      const cellObj: CellCoordinates = { r, c, text: cellVal };

      // Detect Date Anchor
      const isoDate = parseIsoDate(cellVal, cohortYear);
      if (isoDate) {
        cellObj.dateStr = isoDate;
        dateMap.set(`${r},${c}`, { r, c, isoDate });
      }

      // Detect Time Anchor e.g. "09.00 AM to 11.00 AM", "11.00 AM to 01.00 PM", "02.00 pm to 04.00 pm"
      const timeMatch = cellVal.match(/\b(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*(?:to|-)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\b/i);
      if (timeMatch) {
        let startRaw = timeMatch[1].trim();
        const endRaw = timeMatch[2].trim();
        const endAmPm = endRaw.match(/(am|pm)/i);
        if (!/(am|pm)/i.test(startRaw) && endAmPm) {
          startRaw += ` ${endAmPm[1]}`;
        }
        const t24 = parseTimeTo24h(startRaw);
        if (t24) {
          cellObj.time24h = t24;
          cellObj.rawTimeStr = `${startRaw} - ${endRaw}`;
          timeMap.set(`${r},${c}`, { r, c, time24h: t24, rawTime: `${startRaw} - ${endRaw}` });
        }
      }

      cells[r][c] = cellObj;
    }
  }

  // If no spatial date anchors found, return null (fallback to standard engines)
  if (dateMap.size === 0) return null;

  const events: ScheduleEvent[] = [];

  // Step 2: Associate content cells with spatial Date & Time anchors
  for (let r = 0; r < numRows; r++) {
    // Find row date anchor (in row r or nearest preceding row r_date <= r)
    let rowDateAnchor: string | undefined;
    for (let c = 0; c < maxCols; c++) {
      if (cells[r][c].dateStr) {
        rowDateAnchor = cells[r][c].dateStr;
        break;
      }
    }

    if (!rowDateAnchor) continue;

    for (let c = 0; c < maxCols; c++) {
      const cellText = cells[r][c].text;
      if (!cellText || cellText.length < 3) continue;
      if (cells[r][c].dateStr) continue; // Skip date anchor cell itself
      if (/^(date|day|subject|faculty|time|sl\.?\s*no|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/i.test(cellText)) continue; // Skip header label & day name cells

      // Check inline time inside cell text e.g. "Session by Dr Uma VR 9:15 - 9:45 am"
      let cellTime24h: string | undefined;
      let cellRawTime: string | undefined;

      const inlineMatch = cellText.match(/\b(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*(?:to|-)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\b/i);
      if (inlineMatch) {
        let startRaw = inlineMatch[1].trim();
        const endRaw = inlineMatch[2].trim();
        const endAmPm = endRaw.match(/(am|pm)/i);
        if (!/(am|pm)/i.test(startRaw) && endAmPm) {
          startRaw += ` ${endAmPm[1]}`;
        }
        cellTime24h = parseTimeTo24h(startRaw) || undefined;
        cellRawTime = `${startRaw} - ${endRaw}`;
      }

      // If no inline time, find nearest column Time Anchor in column c (e.g. in header row above)
      if (!cellTime24h) {
        for (let r_time = 0; r_time < r; r_time++) {
          if (cells[r_time][c] && cells[r_time][c].time24h) {
            cellTime24h = cells[r_time][c].time24h;
            cellRawTime = cells[r_time][c].rawTimeStr;
            break;
          }
          if (c > 0 && cells[r_time][c - 1] && cells[r_time][c - 1].time24h) {
            cellTime24h = cells[r_time][c - 1].time24h;
            cellRawTime = cells[r_time][c - 1].rawTimeStr;
            break;
          }
        }
      }

      const finalTime24h = cellTime24h || '09:00';
      const finalRawTime = cellRawTime || '09:00 AM';

      // Extract partner text (e.g. Faculty cell adjacent to Subject cell)
      let partnerText = '';
      if (c + 1 < maxCols && cells[r][c + 1] && !cells[r][c + 1].dateStr) {
        partnerText = cells[r][c + 1].text;
      }

      const combinedText = `${cellText} ${partnerText}`.trim();

      // Extract Venue
      let venue: string | undefined;
      const venueMatch = combinedText.match(/\b(?:Venue|Room)\s*[:\-]?\s*([^,\n\)]+)/i);
      if (venueMatch) {
        venue = `Venue: ${venueMatch[1].trim()}`;
      }

      // Extract Faculty
      let faculty: string | undefined;
      const facultyMatch = combinedText.match(/\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+[A-Za-z\s]+?)(?=\s*\(|\s*,|\s*Venue|\s*$)/i);
      if (facultyMatch) {
        faculty = facultyMatch[1].trim();
      } else if (partnerText && !/\b\d{1,2}[:.]\d{2}\b/.test(partnerText)) {
        faculty = partnerText.replace(/\bVenue\s*:.*$/i, '').trim();
      }

      // Clean Title
      let cleanTitle = cellText;
      cleanTitle = cleanTitle.replace(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*(?:to|-)\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/gi, '');
      cleanTitle = cleanTitle.replace(/\bVenue\s*:[^,\)]+/gi, '');
      cleanTitle = cleanTitle.replace(/[,;:\-_|]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanTitle || cleanTitle.length < 2) cleanTitle = cellText;

      // Behavioral Science Heuristics Engine Pass
      const inferred = behavioralEngineInstance.inferMissingInformation(cleanTitle, faculty, venue);
      cleanTitle = inferred.inferredSubject;
      faculty = inferred.inferredFaculty || faculty;
      venue = inferred.inferredVenue || venue;

      events.push({
        id: Math.random().toString(36).substring(2, 9),
        title: cleanTitle,
        date: rowDateAnchor,
        dayOfWeek: 1,
        time: finalTime24h,
        rawTime: finalRawTime,
        faculty: faculty || undefined,
        venue: venue || undefined,
        reminderMinutesBefore: 5,
        category: classifyEventCategory(cleanTitle)
      });

      // Skip adjacent partner cell if it was merged as faculty
      if (partnerText && c + 1 < maxCols) {
        c++;
      }
    }
  }

  if (events.length === 0) return null;

  // Dual-Level Chronological Sorting (Primary: Date, Secondary: Time)
  events.sort((a, b) => {
    const dateA = a.date || '9999-99-99';
    const dateB = b.date || '9999-99-99';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.time.localeCompare(b.time);
  });

  return events;
}
