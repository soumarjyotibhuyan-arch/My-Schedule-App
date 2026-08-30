/**
 * Matrix Parser — Universal Timetable Matrix Grid Parser
 * Handles both orientations:
 *   MATRIX_H: Days=rows, Time-slots=columns (most common college Excel timetable)
 *   MATRIX_V: Time-slots=rows, Days=columns (transposed variant)
 *
 * Also handles multi-line/composite cells like:
 *   "CS304 - Algorithms\nProf. Sharma\nLH-301 (Block B)"
 */

import { ScheduleEvent } from '../types';
import { classifyEventCategory } from './categorizer';
import { behavioralEngineInstance } from './behavioralEngine';
import { LayoutDetection } from './layoutDetector';

const DAYS_MAP: Record<string, number> = {
  monday: 1, mon: 1, m: 1,
  tuesday: 2, tue: 2, t: 2,
  wednesday: 3, wed: 3, w: 3,
  thursday: 4, thu: 4, r: 4,
  friday: 5, fri: 5, f: 5,
  saturday: 6, sat: 6, s: 6,
  sunday: 7, sun: 7, u: 7,
};

function dayNameToISO(name: string): number | null {
  const clean = name.trim().toLowerCase().replace(/\.$/, '');
  // Handle "Day 1" etc.
  const dayNumMatch = clean.match(/^day\s*(\d+)$/);
  if (dayNumMatch) {
    const n = parseInt(dayNumMatch[1], 10);
    return n >= 1 && n <= 7 ? n : null;
  }
  return DAYS_MAP[clean] ?? null;
}

function parseTimeTo24h(timeStr: string): string | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toLowerCase();

  const rangeMatch = cleaned.match(/\b(\d{1,2})[:.h](\d{2})?\s*(am|pm)?\s*(?:[-–to]+)\s*(\d{1,2})[:.h](\d{2})?\s*(am|pm)?\b/i);
  if (rangeMatch) {
    let h = parseInt(rangeMatch[1], 10);
    const m = parseInt(rangeMatch[2] || '0', 10);
    const ampm = rangeMatch[3] || rangeMatch[6];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!ampm && h >= 1 && h <= 6) h += 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const singleMatch = cleaned.match(/\b(\d{1,2})[:.h]?(\d{2})?\s*(am|pm)\b/i);
  if (singleMatch) {
    let h = parseInt(singleMatch[1], 10);
    const m = parseInt(singleMatch[2] || '0', 10);
    const ampm = singleMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const plain = cleaned.match(/^(\d{1,2})[:.h](\d{2})$/);
  if (plain) {
    let h = parseInt(plain[1], 10);
    const m = parseInt(plain[2], 10);
    if (h >= 1 && h <= 6) h += 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

function extractRawTimeRange(cellStr: string): string | null {
  const match = cellStr.match(/\b(\d{1,2}[:.h]\d{2}\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}[:.h]\d{2}\s*(?:am|pm)?)\b/i);
  if (match) return `${match[1].trim()} - ${match[2].trim()}`;
  return null;
}

// ─── MULTI-LINE CELL DECODER ─────────────────────────────────────────────────
interface CellParts {
  title: string;
  faculty?: string;
  venue?: string;
  code?: string;
}

const FACULTY_PREFIX = /^(?:Dr|Prof|Mr|Ms|Mrs|Er)\.?\s+/i;
const VENUE_PATTERN = /\b(?:Room|Lab|Hall|LHC|Audi(?:torium)?|Floor|Block|Bldg|Building|Venue|LH|B-|Room-?)\s*[\w\-]+/i;
const CODE_PATTERN = /\b[A-Z]{2,4}\d{3,4}[A-Z]?\b/;

function decodeCellText(rawCell: string): CellParts {
  // Normalize separators: newlines, slashes, pipes, semicolons
  const lines = rawCell
    .replace(/[\n\r]+/g, '\n')
    .replace(/\s*[|/;]\s*/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { title: rawCell.trim() };

  let title = '';
  let faculty: string | undefined;
  let venue: string | undefined;
  let code: string | undefined;

  for (const line of lines) {
    // Faculty line
    if (FACULTY_PREFIX.test(line)) {
      faculty = line;
      continue;
    }
    // Venue line
    if (VENUE_PATTERN.test(line)) {
      venue = line;
      continue;
    }
    // Pure course code
    if (CODE_PATTERN.test(line) && line.length <= 12 && !title) {
      code = line;
      continue;
    }
    // First substantive line → title
    if (!title && line.length >= 2) {
      title = line;
    } else if (title && !faculty && !venue && line.length >= 3) {
      // Second line after title — could be faculty or venue
      if (/\d{3,}/.test(line) || VENUE_PATTERN.test(line)) {
        venue = line;
      } else {
        faculty = faculty || line;
      }
    }
  }

  if (!title) title = lines[0] || rawCell.trim();
  if (code && !title.includes(code)) title = `${code} - ${title}`;

  // Apply behavioral engine inference
  const inferred = behavioralEngineInstance.inferMissingInformation(title, faculty, venue);
  return {
    title: inferred.inferredSubject || title,
    faculty: inferred.inferredFaculty || faculty,
    venue: inferred.inferredVenue || venue,
    code,
  };
}

const FILLER_CELLS = new Set([
  '', 'free', 'break', 'lunch', 'recess', 'holiday', 'gap',
  '-', '--', 'n/a', 'na', 'nil', 'x', 'xx', 'tbd', 'tba',
  'leave', 'off', 'no class', 'no session',
]);

function isFiller(cell: string): boolean {
  return FILLER_CELLS.has(cell.trim().toLowerCase());
}

// ─── MATRIX_H PARSER ──────────────────────────────────────────────────────────
// Row 0 (or detection.headerRowIndex): time slot headers  ["", "09:00-10:00", "10:15-11:15", ...]
// Col 0 (or detection.headerColIndex): day labels          ["Monday", "Tuesday", ...]
// Cells[r][c]: subject/faculty/venue content

function parseMatrixH(rows: any[][], detection: LayoutDetection): ScheduleEvent[] {
  const timeHeaderRow = detection.headerRowIndex;
  const dayLabelCol = detection.headerColIndex;

  // Extract time slots from header row
  const timeSlots: { time24h: string; rawTime: string; col: number }[] = [];
  const headerRow = rows[timeHeaderRow] || [];
  for (let c = 0; c < headerRow.length; c++) {
    if (c === dayLabelCol) continue;
    const cellStr = String(headerRow[c] || '').trim();
    if (!cellStr) continue;
    const raw = extractRawTimeRange(cellStr) || cellStr;
    const t24 = parseTimeTo24h(cellStr);
    if (t24) {
      timeSlots.push({ time24h: t24, rawTime: raw, col: c });
    }
  }

  const events: ScheduleEvent[] = [];

  // Process data rows
  for (let r = timeHeaderRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const dayCell = String(row[dayLabelCol] ?? '').trim();
    if (!dayCell) continue;

    const dayOfWeek = dayNameToISO(dayCell);
    if (!dayOfWeek) continue;

    for (const slot of timeSlots) {
      const rawCell = String(row[slot.col] ?? '').trim();
      if (!rawCell || isFiller(rawCell)) continue;

      const parts = decodeCellText(rawCell);
      if (!parts.title || parts.title.length < 2 || isFiller(parts.title)) continue;

      const category = classifyEventCategory(parts.title);
      if (parts.title && parts.faculty) {
        behavioralEngineInstance.recordAvailability(parts.title, parts.faculty, parts.venue);
      }

      events.push({
        id: `mx-${r}-${slot.col}-${Math.random().toString(36).substring(2, 7)}`,
        title: parts.title,
        time: slot.time24h,
        rawTime: slot.rawTime,
        dayOfWeek,
        faculty: parts.faculty,
        venue: parts.venue,
        reminderMinutesBefore: 5,
        category,
      });
    }
  }

  return events;
}

// ─── MATRIX_V PARSER ──────────────────────────────────────────────────────────
// Row 0 (or detection.headerRowIndex): day headers         ["", "Monday", "Tuesday", ...]
// Col 0 (or detection.headerColIndex): time slot labels    ["09:00-10:00", "10:15-11:15", ...]
// Cells[r][c]: subject/faculty/venue content

function parseMatrixV(rows: any[][], detection: LayoutDetection): ScheduleEvent[] {
  const dayHeaderRow = detection.headerRowIndex;
  const timeSlotCol = detection.headerColIndex;

  // Extract days from header row
  const dayHeaders: { dayOfWeek: number; col: number }[] = [];
  const headerRow = rows[dayHeaderRow] || [];
  for (let c = 0; c < headerRow.length; c++) {
    if (c === timeSlotCol) continue;
    const cellStr = String(headerRow[c] || '').trim();
    const dayOfWeek = dayNameToISO(cellStr);
    if (dayOfWeek) {
      dayHeaders.push({ dayOfWeek, col: c });
    }
  }

  const events: ScheduleEvent[] = [];

  // Process data rows
  for (let r = dayHeaderRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const timeCell = String(row[timeSlotCol] ?? '').trim();
    if (!timeCell) continue;

    const raw = extractRawTimeRange(timeCell) || timeCell;
    const t24 = parseTimeTo24h(timeCell);
    if (!t24) continue;

    for (const dh of dayHeaders) {
      const rawCell = String(row[dh.col] ?? '').trim();
      if (!rawCell || isFiller(rawCell)) continue;

      const parts = decodeCellText(rawCell);
      if (!parts.title || parts.title.length < 2 || isFiller(parts.title)) continue;

      const category = classifyEventCategory(parts.title);
      if (parts.title && parts.faculty) {
        behavioralEngineInstance.recordAvailability(parts.title, parts.faculty, parts.venue);
      }

      events.push({
        id: `mv-${r}-${dh.col}-${Math.random().toString(36).substring(2, 7)}`,
        title: parts.title,
        time: t24,
        rawTime: raw,
        dayOfWeek: dh.dayOfWeek,
        faculty: parts.faculty,
        venue: parts.venue,
        reminderMinutesBefore: 5,
        category,
      });
    }
  }

  return events;
}

// ─── PUBLIC ENTRY POINT ───────────────────────────────────────────────────────
export function parseMatrixTimetable(rows: any[][], detection: LayoutDetection): ScheduleEvent[] | null {
  if (!rows || rows.length < 2) return null;

  let events: ScheduleEvent[];

  if (detection.type === 'MATRIX_V') {
    events = parseMatrixV(rows, detection);
  } else {
    // MATRIX_H (default)
    events = parseMatrixH(rows, detection);

    // If H parse yields nothing, try V as fallback before returning null
    if (events.length === 0) {
      const vEvents = parseMatrixV(rows, { ...detection, type: 'MATRIX_V', timeSlotAxis: 'row', dayAxis: 'col' });
      if (vEvents.length > events.length) events = vEvents;
    }
  }

  if (events.length === 0) return null;

  // Sort chronologically by day, then time
  events.sort((a, b) => {
    const dayDiff = (a.dayOfWeek ?? 8) - (b.dayOfWeek ?? 8);
    if (dayDiff !== 0) return dayDiff;
    return a.time.localeCompare(b.time);
  });

  return events;
}
