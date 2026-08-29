import { ScheduleEvent } from '../types';
import { saveEvents } from './storage';

export interface ColumnMapping {
  titleColIndex: number;
  timeColIndex: number;
  dateColIndex: number;
  venueColIndex: number;
  facultyColIndex: number;
}

export interface AnalysisResult {
  fingerprint: string;
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
  confidenceScore: number; // 0 to 100
}

// Levenshtein distance for fuzzy string matching
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyScore(input: string, targets: string[]): number {
  const cleanInput = input.toLowerCase().trim();
  let maxScore = 0;
  for (const target of targets) {
    const cleanTarget = target.toLowerCase().trim();
    if (cleanInput.includes(cleanTarget) || cleanTarget.includes(cleanInput)) return 100;
    const dist = levenshtein(cleanInput, cleanTarget);
    const maxLen = Math.max(cleanInput.length, cleanTarget.length);
    if (maxLen > 0) {
      const score = Math.round((1 - dist / maxLen) * 100);
      if (score > maxScore) maxScore = score;
    }
  }
  return maxScore;
}

// Regex detection rules for time, date, venue, and faculty
const TIME_REGEX = /\b([01]?\d|2[0-3]):[0-5]\d\b|\b(1[0-2]|0?[1-9]):[0-5]\d\s*(AM|PM)\b/i;
const DATE_REGEX = /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
const VENUE_REGEX = /\b(Room|Hall|Lab|Floor|Building|LHC|Auditorium|Venue|\d{3})\b/i;
const FACULTY_REGEX = /\b(Dr|Prof|Instructor|Faculty|Teacher|Lecturer)\b/i;

// Analyze raw 2D grid matrix rows to automatically map columns and calculate confidence score
export function analyzeGridStructure(gridRows: string[][]): AnalysisResult {
  if (!gridRows || gridRows.length === 0) {
    return {
      fingerprint: '',
      headers: [],
      sampleRows: [],
      mapping: { titleColIndex: 0, timeColIndex: 1, dateColIndex: 2, venueColIndex: -1, facultyColIndex: -1 },
      confidenceScore: 0,
    };
  }

  // Treat first row as potential headers
  const rawHeaders = gridRows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const sampleRows = gridRows.slice(1, 4);

  const numCols = Math.max(...gridRows.map(r => r.length));
  const fingerprint = rawHeaders.map(h => h.toLowerCase()).join('|');

  let titleColIndex = -1;
  let timeColIndex = -1;
  let dateColIndex = -1;
  let venueColIndex = -1;
  let facultyColIndex = -1;

  let totalConfidenceSum = 0;
  let totalEvaluatedFields = 0;

  for (let c = 0; c < numCols; c++) {
    const headerText = rawHeaders[c] || '';
    const sampleCells = sampleRows.map(r => r[c] || '').filter(Boolean);
    const combinedSampleText = sampleCells.join(' ');

    // 1. Time Column Detection
    const headerTimeScore = fuzzyScore(headerText, ['time', 'timing', 'slot', 'start time', 'schedule time', 'hours']);
    const sampleTimeMatch = sampleCells.some(cell => TIME_REGEX.test(cell));
    if ((headerTimeScore > 60 || sampleTimeMatch) && timeColIndex === -1) {
      timeColIndex = c;
      totalConfidenceSum += sampleTimeMatch ? 100 : headerTimeScore;
      totalEvaluatedFields++;
    }

    // 2. Date / Day Column Detection
    const headerDateScore = fuzzyScore(headerText, ['date', 'day', 'day of week', 'weekday', 'session date']);
    const sampleDateMatch = sampleCells.some(cell => DATE_REGEX.test(cell));
    if ((headerDateScore > 60 || sampleDateMatch) && dateColIndex === -1) {
      dateColIndex = c;
      totalConfidenceSum += sampleDateMatch ? 100 : headerDateScore;
      totalEvaluatedFields++;
    }

    // 3. Subject / Title Column Detection
    const headerTitleScore = fuzzyScore(headerText, ['subject', 'title', 'course', 'topic', 'class', 'event', 'module']);
    if (headerTitleScore > 60 && titleColIndex === -1) {
      titleColIndex = c;
      totalConfidenceSum += headerTitleScore;
      totalEvaluatedFields++;
    }

    // 4. Venue Column Detection
    const headerVenueScore = fuzzyScore(headerText, ['venue', 'room', 'location', 'hall', 'building', 'place']);
    const sampleVenueMatch = sampleCells.some(cell => VENUE_REGEX.test(cell));
    if ((headerVenueScore > 60 || sampleVenueMatch) && venueColIndex === -1) {
      venueColIndex = c;
      totalConfidenceSum += sampleVenueMatch ? 90 : headerVenueScore;
      totalEvaluatedFields++;
    }

    // 5. Faculty Column Detection
    const headerFacultyScore = fuzzyScore(headerText, ['faculty', 'instructor', 'teacher', 'professor', 'dr', 'speaker']);
    const sampleFacultyMatch = sampleCells.some(cell => FACULTY_REGEX.test(cell));
    if ((headerFacultyScore > 60 || sampleFacultyMatch) && facultyColIndex === -1) {
      facultyColIndex = c;
      totalConfidenceSum += sampleFacultyMatch ? 90 : headerFacultyScore;
      totalEvaluatedFields++;
    }
  }

  // Fallbacks if not uniquely identified
  if (titleColIndex === -1) titleColIndex = 0;
  if (timeColIndex === -1) timeColIndex = 1 < numCols ? 1 : 0;
  if (dateColIndex === -1 && numCols > 2) dateColIndex = 2;

  const confidenceScore = totalEvaluatedFields > 0
    ? Math.round(totalConfidenceSum / totalEvaluatedFields)
    : 50;

  return {
    fingerprint,
    headers: rawHeaders,
    sampleRows,
    mapping: {
      titleColIndex,
      timeColIndex,
      dateColIndex,
      venueColIndex,
      facultyColIndex,
    },
    confidenceScore,
  };
}

// Parse grid rows using confirmed column mapping schema
export function parseGridWithMapping(gridRows: string[][], mapping: ColumnMapping): ScheduleEvent[] {
  if (!gridRows || gridRows.length < 2) return [];

  const events: ScheduleEvent[] = [];
  const startRowIdx = 1; // Skip header row

  for (let r = startRowIdx; r < gridRows.length; r++) {
    const row = gridRows[r];
    if (!row || row.length === 0) continue;

    const rawTitle = (row[mapping.titleColIndex] || '').trim();
    const rawTime = (row[mapping.timeColIndex] || '').trim();
    const rawDate = mapping.dateColIndex !== -1 ? (row[mapping.dateColIndex] || '').trim() : '';
    const rawVenue = mapping.venueColIndex !== -1 ? (row[mapping.venueColIndex] || '').trim() : '';
    const rawFaculty = mapping.facultyColIndex !== -1 ? (row[mapping.facultyColIndex] || '').trim() : '';

    if (!rawTitle && !rawTime) continue;

    // Normalize time (24-hour HH:MM)
    let timeStr = '09:00';
    const timeMatch = rawTime.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2];
      if (/pm/i.test(rawTime) && h < 12) h += 12;
      if (/am/i.test(rawTime) && h === 12) h = 0;
      timeStr = `${String(h).padStart(2, '0')}:${m}`;
    }

    // Normalize date or weekday
    let dateStr: string | undefined = undefined;
    let dayOfWeek: number | undefined = undefined;

    if (rawDate) {
      const dateMatch = rawDate.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/);
      if (dateMatch) {
        dateStr = dateMatch[0].replace(/\//g, '-');
      } else {
        const lower = rawDate.toLowerCase();
        if (lower.includes('mon')) dayOfWeek = 1;
        else if (lower.includes('tue')) dayOfWeek = 2;
        else if (lower.includes('wed')) dayOfWeek = 3;
        else if (lower.includes('thu')) dayOfWeek = 4;
        else if (lower.includes('fri')) dayOfWeek = 5;
        else if (lower.includes('sat')) dayOfWeek = 6;
        else if (lower.includes('sun')) dayOfWeek = 7;
      }
    }

    events.push({
      id: `custom-${r}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: rawTitle || 'Scheduled Session',
      time: timeStr,
      date: dateStr,
      dayOfWeek: dayOfWeek,
      rawTime: rawTime || timeStr,
      venue: rawVenue || undefined,
      faculty: rawFaculty || undefined,
      reminderMinutesBefore: 5,
    });
  }

  return events;
}
