import { ScheduleEvent } from '../types';
import { parseScheduleWithAI } from './aiParser';
import { parseGridTimetable } from './gridParser';
import { behavioralEngineInstance } from './behavioralEngine';
import { classifyEventCategory } from './categorizer';

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12
};

function normalizeIsoDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const str = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Match e.g. "13 July" or "13 July 2026"
  const match = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const mStr = match[2].toLowerCase();
    const yr = match[3] || '2026';
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Match e.g. "13-Jul-26" or "13/07/2026"
  const dashMatch = str.match(/^(\d{1,2})[-/\.]([A-Za-z0-9]{2,9})[-/\.](\d{2,4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const mPart = dashMatch[2].toLowerCase();
    let yr = dashMatch[3];
    if (yr.length === 2) yr = `20${yr}`;
    
    let month = parseInt(mPart, 10);
    if (isNaN(month)) {
      month = MONTH_MAP[mPart] || 0;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return undefined;
}

function parseTimeTo24h(timeStr?: string): string {
  if (!timeStr) return "09:00";
  const cleaned = timeStr.trim().toLowerCase();
  const match = cleaned.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const singleMatch = cleaned.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (singleMatch) {
    let hours = parseInt(singleMatch[1], 10);
    const ampm = singleMatch[2];
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:00`;
  }
  return "09:00";
}

import { parseMultidirectionalGrid } from './multidirectionalParser';

/**
 * Agentic Universal Schedule Format Adapter Pipeline
 * Processes any uploaded file text or raw 2D grid rows into a unified, clean, sorted ScheduleEvent[] format.
 */
export async function runAgenticFormatAdapter(
  rawText: string,
  gridRows?: any[][]
): Promise<ScheduleEvent[]> {
  // Phase 1: Try OpenRouter AI Engine
  const aiResult = await parseScheduleWithAI(rawText, gridRows);
  let candidateEvents = aiResult.events || [];

  // Phase 2: Multidirectional Sequence-Agnostic Grid Matrix Parser (Top-to-Bottom, Left-to-Right, Transposed)
  if (candidateEvents.length === 0 && gridRows && gridRows.length > 0) {
    const multiEvents = parseMultidirectionalGrid(gridRows);
    if (multiEvents && multiEvents.length > 0) {
      candidateEvents = multiEvents;
    } else {
      const gridEvents = parseGridTimetable(gridRows);
      if (gridEvents && gridEvents.length > 0) {
        candidateEvents = gridEvents;
      }
    }
  }

  // Phase 3: Behavioral Science Heuristics Normalization & Enhancement Pass
  const normalizedEvents: ScheduleEvent[] = candidateEvents.map(evt => {
    const cleanDate = normalizeIsoDate(evt.date) || evt.date;
    const cleanTime = parseTimeTo24h(evt.time);

    // Apply behavioral science heuristic inference for missing faculty/venue
    const inferred = behavioralEngineInstance.inferMissingInformation(
      evt.title,
      evt.faculty || '',
      evt.venue || ''
    );

    return {
      id: evt.id || Math.random().toString(36).substring(2, 9),
      title: evt.title.trim(),
      date: cleanDate,
      dayOfWeek: evt.dayOfWeek || 1,
      time: cleanTime,
      rawTime: evt.rawTime || format12hTime(cleanTime),
      faculty: inferred.inferredFaculty || evt.faculty || undefined,
      venue: inferred.inferredVenue || evt.venue || undefined,
      reminderMinutesBefore: evt.reminderMinutesBefore || 5,
      category: evt.category || classifyEventCategory(evt.title)
    };
  });

  // Phase 4: Dual-Level Chronological Sorting (Primary: Date, Secondary: Time)
  normalizedEvents.sort((a, b) => {
    const dateA = a.date || '9999-99-99';
    const dateB = b.date || '9999-99-99';
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    return a.time.localeCompare(b.time);
  });

  return normalizedEvents;
}

function format12hTime(time24h: string): string {
  const [hStr, mStr] = time24h.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}
