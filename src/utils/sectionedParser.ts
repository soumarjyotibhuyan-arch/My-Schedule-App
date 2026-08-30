/**
 * Sectioned Parser — Handles freeform text/block-style timetables
 *
 * Supports formats like:
 *   == MONDAY ==
 *   09:00 - 10:00: Data Structures (B201)
 *   10:30 - 12:00: Computer Networks
 *
 *   ## Tuesday
 *   9am-10:30am | Machine Learning | Dr. Rao | LHC-301
 *
 *   [WEDNESDAY]
 *   Period 1 (09:00-10:00) - Physics
 */

import { ScheduleEvent } from '../types';
import { classifyEventCategory } from './categorizer';
import { behavioralEngineInstance } from './behavioralEngine';

const DAYS_MAP: Record<string, number> = {
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  sunday: 7, sun: 7,
};

// Regex for day section headers
const DAY_HEADER_RE = /^[\s=#\[\-*_]{0,5}\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s*[\s=#\]\-*_]{0,5}$/i;

// Regex for time-annotated entries
const TIME_ENTRY_RE = /\b(\d{1,2}[:.h]\d{2}\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}[:.h]\d{2}\s*(?:am|pm)?)\s*[:\-|]?\s*(.*)/i;
const PERIOD_ENTRY_RE = /\b(?:period|session|slot)\s*(\d+)\s*(?:\(([^)]+)\))?\s*[:\-|]?\s*(.*)/i;

// Regex for faculty in inline text
const FACULTY_INLINE = /\b((?:Dr|Prof|Mr|Ms|Mrs|Er)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
// Regex for venue in inline text
const VENUE_INLINE = /\b(?:Room|Lab|Hall|LHC|Audi(?:torium)?|Floor|Block|Bldg|B-)\s*[\w\-]+/i;

function parseTimeTo24h(s: string): string | null {
  const cleaned = s.trim().toLowerCase();
  const m = cleaned.match(/^(\d{1,2})[:.h]?(\d{2})?\s*(am|pm)?$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const mins = parseInt(m[2] || '0', 10);
    const ampm = m[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!ampm && h >= 1 && h <= 6) h += 12;
    return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return null;
}

function extractFacultyVenue(text: string): { cleanTitle: string; faculty?: string; venue?: string } {
  let remaining = text;
  let faculty: string | undefined;
  let venue: string | undefined;

  const facultyMatch = remaining.match(FACULTY_INLINE);
  if (facultyMatch) {
    faculty = facultyMatch[1].trim();
    remaining = remaining.replace(facultyMatch[0], '').trim();
  }

  const venueMatch = remaining.match(VENUE_INLINE);
  if (venueMatch) {
    venue = venueMatch[0].trim();
    remaining = remaining.replace(venueMatch[0], '').trim();
  }

  // Also try parentheses-enclosed venue codes like "(B201)" or "(LH-301)"
  const parenVenue = remaining.match(/\(([A-Z][\w\-]{2,})\)/);
  if (parenVenue && !venue) {
    venue = parenVenue[1];
    remaining = remaining.replace(parenVenue[0], '').trim();
  }

  // Clean up title
  let cleanTitle = remaining
    .replace(/^[\s:\-|]+/, '')
    .replace(/[\s:\-|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const inferred = behavioralEngineInstance.inferMissingInformation(cleanTitle, faculty, venue);
  return {
    cleanTitle: inferred.inferredSubject || cleanTitle,
    faculty: inferred.inferredFaculty || faculty,
    venue: inferred.inferredVenue || venue,
  };
}

/**
 * Parse freeform text (a single string) into ScheduleEvents
 * This handles multi-day block schedules in raw text form
 */
export function parseSectionedText(rawText: string): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const lines = rawText.split(/\r?\n/);
  let currentDayOfWeek: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for day section header
    const dayHeaderMatch = trimmed.match(DAY_HEADER_RE);
    if (dayHeaderMatch) {
      const dayName = dayHeaderMatch[1].toLowerCase();
      currentDayOfWeek = DAYS_MAP[dayName] ?? null;
      continue;
    }

    if (!currentDayOfWeek) continue;

    // Check for time-range annotated entry
    const timeEntryMatch = trimmed.match(TIME_ENTRY_RE);
    if (timeEntryMatch) {
      const startRaw = timeEntryMatch[1].trim();
      const endRaw = timeEntryMatch[2].trim();
      const rest = timeEntryMatch[3].trim();

      const endAmPm = endRaw.match(/(am|pm)/i);
      let startNorm = startRaw;
      if (!/am|pm/i.test(startRaw) && endAmPm) {
        startNorm = `${startRaw} ${endAmPm[1]}`;
      }

      const t24 = parseTimeTo24h(startNorm) || parseTimeTo24h(startRaw);
      if (!t24 || !rest) continue;

      const { cleanTitle, faculty, venue } = extractFacultyVenue(rest);
      if (!cleanTitle || cleanTitle.length < 2) continue;

      const rawTime = `${startRaw} - ${endRaw}`;
      const category = classifyEventCategory(cleanTitle);
      if (cleanTitle && faculty) behavioralEngineInstance.recordAvailability(cleanTitle, faculty, venue);

      events.push({
        id: `sec-${currentDayOfWeek}-${t24}-${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        time: t24,
        rawTime,
        dayOfWeek: currentDayOfWeek,
        faculty,
        venue,
        reminderMinutesBefore: 5,
        category,
      });
      continue;
    }

    // Check for Period/Session entries
    const periodMatch = trimmed.match(PERIOD_ENTRY_RE);
    if (periodMatch) {
      const periodTimeStr = periodMatch[2]; // e.g. "09:00-10:00" from inside parens
      const rest = periodMatch[3].trim();

      let t24 = '09:00';
      let rawTime = `Period ${periodMatch[1]}`;
      if (periodTimeStr) {
        const innerMatch = periodTimeStr.match(TIME_ENTRY_RE);
        if (innerMatch) {
          t24 = parseTimeTo24h(innerMatch[1]) || '09:00';
          rawTime = periodTimeStr;
        }
      }

      if (!rest) continue;
      const { cleanTitle, faculty, venue } = extractFacultyVenue(rest);
      if (!cleanTitle || cleanTitle.length < 2) continue;

      const category = classifyEventCategory(cleanTitle);
      events.push({
        id: `sec-p${periodMatch[1]}-${currentDayOfWeek}-${Math.random().toString(36).substring(2, 6)}`,
        title: cleanTitle,
        time: t24,
        rawTime,
        dayOfWeek: currentDayOfWeek,
        faculty,
        venue,
        reminderMinutesBefore: 5,
        category,
      });
    }
  }

  // Sort by day, then time
  events.sort((a, b) => {
    const dayDiff = (a.dayOfWeek ?? 8) - (b.dayOfWeek ?? 8);
    if (dayDiff !== 0) return dayDiff;
    return a.time.localeCompare(b.time);
  });

  return events;
}

/**
 * Utility: Convert a 2D grid (single-column or merged) to flat text for sectioned parsing
 */
export function gridToSectionedText(rows: any[][]): string {
  return rows
    .map((row) => (row || []).map((c: any) => String(c || '').trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}
