/**
 * Layout Detector — Universal Timetable Format Classification Engine
 * Classifies a 2D grid (any[][] from CSV or Excel) into one of 5 layout types
 * before routing to the correct parser.
 */

export type LayoutType =
  | 'MATRIX_H'    // Horizontal Matrix: Days=rows, Time-slots=columns (most common college timetable)
  | 'MATRIX_V'    // Vertical Matrix: Time-slots=rows, Days=columns (transposed)
  | 'LINEAR'      // Linear/Row-based: each row is one event (Day, Time, Subject, Venue, Faculty cols)
  | 'SECTIONED'   // Sectioned blocks: "== MONDAY ==\n09:00-10:00: Subject" freeform text
  | 'UNKNOWN';    // Cannot determine → route to AI

export interface LayoutDetection {
  type: LayoutType;
  confidence: number;     // 0–100
  timeSlotAxis: 'row' | 'col' | null;
  dayAxis: 'row' | 'col' | null;
  headerRowIndex: number; // index of the row that contains time/day headers
  headerColIndex: number; // index of the col that contains time/day labels
}

// ─── PATTERNS ────────────────────────────────────────────────────────────────
const DAY_PATTERNS: RegExp[] = [
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(mon|tue|wed|thu|fri|sat|sun)\b/i,
  /\bday\s*\d+\b/i,         // "Day 1", "Day 2"
  /\b[MTWRFS]{1,3}\b/,      // "M", "T", "W", "R", "F", "S" (US-style shorthand)
];

const TIME_SLOT_PATTERNS: RegExp[] = [
  /\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*[-–to]+\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/i,  // "09:00-10:00"
  /\b\d{1,2}\s*(?:am|pm)\s*[-–to]+\s*\d{1,2}\s*(?:am|pm)\b/i,                       // "9am to 10am"
  /\b(?:\d{1,2}(?:st|nd|rd|th)?\s+period)\b/i,                                        // "1st Period"
  /\bperiod\s*\d+\b/i,                                                                  // "Period 4"
  /\bsession\s*\d+\b/i,                                                                 // "Session 1"
];

const LINEAR_HEADER_PATTERNS = [
  'subject', 'course', 'class', 'module', 'title', 'event',
  'time', 'timing', 'slot', 'start',
  'day', 'date', 'weekday',
  'venue', 'room', 'hall', 'location',
  'faculty', 'instructor', 'teacher', 'professor',
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function isDay(cell: string): boolean {
  return DAY_PATTERNS.some((p) => p.test(cell.trim()));
}

function isTimeSlot(cell: string): boolean {
  return TIME_SLOT_PATTERNS.some((p) => p.test(cell.trim()));
}

function isLinearHeader(cell: string): boolean {
  const lower = cell.trim().toLowerCase();
  return LINEAR_HEADER_PATTERNS.some((kw) => lower.includes(kw));
}

function countMatches(cells: string[], tester: (c: string) => boolean): number {
  return cells.filter((c) => tester(c)).length;
}

function getNonEmptyCells(arr: any[]): string[] {
  return arr.map((c) => String(c || '').trim()).filter((c) => c.length > 0);
}

// ─── MAIN DETECTOR ────────────────────────────────────────────────────────────
export function detectLayout(rows: any[][]): LayoutDetection {
  if (!rows || rows.length === 0) {
    return { type: 'UNKNOWN', confidence: 0, timeSlotAxis: null, dayAxis: null, headerRowIndex: 0, headerColIndex: 0 };
  }

  const numRows = rows.length;
  let maxCols = 0;
  for (const row of rows) {
    if (row && row.length > maxCols) maxCols = row.length;
  }

  // ── 1. Check for SECTIONED layout (only meaningful for single-column text data) ──────────
  const sectionedScore = detectSectioned(rows);
  if (sectionedScore >= 70) {
    return { type: 'SECTIONED', confidence: sectionedScore, timeSlotAxis: 'row', dayAxis: 'row', headerRowIndex: 0, headerColIndex: 0 };
  }

  // ── 2. Scan each row for day vs time-slot content ─────────────────────────
  const rowDayScores: number[] = [];    // fraction of cells in row that are day names
  const rowTimeScores: number[] = [];   // fraction of cells in row that are time slots
  const colDayScores: number[] = [];    // fraction of cells in col that are day names
  const colTimeScores: number[] = [];   // fraction of cells in col that are time slots

  for (let r = 0; r < Math.min(numRows, 15); r++) {
    const cells = getNonEmptyCells(rows[r] || []);
    const total = cells.length;
    if (total === 0) {
      rowDayScores.push(0);
      rowTimeScores.push(0);
      continue;
    }
    rowDayScores.push(countMatches(cells, isDay) / total);
    rowTimeScores.push(countMatches(cells, isTimeSlot) / total);
  }

  for (let c = 0; c < Math.min(maxCols, 15); c++) {
    const cells: string[] = [];
    for (let r = 0; r < Math.min(numRows, 15); r++) {
      const val = String((rows[r] || [])[c] || '').trim();
      if (val) cells.push(val);
    }
    const total = cells.length;
    if (total === 0) {
      colDayScores.push(0);
      colTimeScores.push(0);
      continue;
    }
    colDayScores.push(countMatches(cells, isDay) / total);
    colTimeScores.push(countMatches(cells, isTimeSlot) / total);
  }

  // ── 3. Find best row/col header candidates ──────────────────────────────────
  const bestDayRow = indexOfMax(rowDayScores);
  const bestTimeRow = indexOfMax(rowTimeScores);
  const bestDayCol = indexOfMax(colDayScores);
  const bestTimeCol = indexOfMax(colTimeScores);

  const maxDayRow = rowDayScores[bestDayRow] || 0;
  const maxTimeRow = rowTimeScores[bestTimeRow] || 0;
  const maxDayCol = colDayScores[bestDayCol] || 0;
  const maxTimeCol = colTimeScores[bestTimeCol] || 0;

  // ── 4. MATRIX_H: Days are rows, time slots are columns ─────────────────────
  // Signature: top row has mostly time-slot strings, left column has mostly day names
  const matrixHScore = Math.round((maxTimeRow * 60 + maxDayCol * 40));
  if (maxTimeRow >= 0.4 && maxDayCol >= 0.4) {
    return {
      type: 'MATRIX_H',
      confidence: Math.min(matrixHScore, 98),
      timeSlotAxis: 'col',
      dayAxis: 'row',
      headerRowIndex: bestTimeRow,
      headerColIndex: bestDayCol,
    };
  }

  // ── 5. MATRIX_V: Time slots are rows, days are columns ─────────────────────
  // Signature: top row has mostly day names, left column has mostly time slots
  const matrixVScore = Math.round((maxDayRow * 60 + maxTimeCol * 40));
  if (maxDayRow >= 0.4 && maxTimeCol >= 0.4) {
    return {
      type: 'MATRIX_V',
      confidence: Math.min(matrixVScore, 98),
      timeSlotAxis: 'row',
      dayAxis: 'col',
      headerRowIndex: bestDayRow,
      headerColIndex: bestTimeCol,
    };
  }

  // ── 6. Also detect matrix if only one strong axis is found ──────────────────
  if (maxTimeRow >= 0.5) {
    // Time-slot row found → likely MATRIX_H or MATRIX_V
    const score = Math.round(maxTimeRow * 80 + maxDayCol * 20);
    if (score > 40) {
      return {
        type: maxDayCol >= 0.3 ? 'MATRIX_H' : 'MATRIX_V',
        confidence: score,
        timeSlotAxis: 'col',
        dayAxis: 'row',
        headerRowIndex: bestTimeRow,
        headerColIndex: 0,
      };
    }
  }
  if (maxDayRow >= 0.5) {
    const score = Math.round(maxDayRow * 80 + maxTimeCol * 20);
    if (score > 40) {
      return {
        type: 'MATRIX_V',
        confidence: score,
        timeSlotAxis: 'row',
        dayAxis: 'col',
        headerRowIndex: 0,
        headerColIndex: bestTimeCol,
      };
    }
  }

  // ── 7. LINEAR: flat rows with semantic column headers ──────────────────────
  const linearScore = detectLinear(rows);
  if (linearScore >= 55) {
    return {
      type: 'LINEAR',
      confidence: linearScore,
      timeSlotAxis: 'col',
      dayAxis: 'col',
      headerRowIndex: 0,
      headerColIndex: 0,
    };
  }

  // ── 8. Fallback ────────────────────────────────────────────────────────────
  return {
    type: 'UNKNOWN',
    confidence: Math.max(linearScore, 30),
    timeSlotAxis: null,
    dayAxis: null,
    headerRowIndex: 0,
    headerColIndex: 0,
  };
}

function detectSectioned(rows: any[][]): number {
  let sectionHeaders = 0;
  let inlineTimeEntries = 0;
  const sectionPattern = /^(?:={2,}|#{1,3}|\-{2,}|\[|==)\s*\w+\s*(?:={2,}|#{1,3}|\-{2,}|\])?$/;
  const inlineTimeEntryPattern = /\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\s*[-–to]+\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)?.+/i;

  for (const row of rows) {
    const combined = (row || []).map((c: any) => String(c || '')).join(' ').trim();
    if (sectionPattern.test(combined)) sectionHeaders++;
    if (inlineTimeEntryPattern.test(combined)) inlineTimeEntries++;
  }

  if (sectionHeaders > 0 || inlineTimeEntries > 2) {
    return Math.min(Math.round((sectionHeaders * 30) + (inlineTimeEntries * 15)), 95);
  }
  return 0;
}

function detectLinear(rows: any[][]): number {
  if (!rows[0]) return 0;
  const headerCells = getNonEmptyCells(rows[0]);
  const linearMatches = countMatches(headerCells, isLinearHeader);
  if (headerCells.length === 0) return 0;
  return Math.round((linearMatches / headerCells.length) * 100);
}

function indexOfMax(arr: number[]): number {
  if (arr.length === 0) return 0;
  let maxIndex = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[maxIndex]) maxIndex = i;
  }
  return maxIndex;
}
