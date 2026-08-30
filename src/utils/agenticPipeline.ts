/**
 * Agentic Universal Schedule Format Adapter Pipeline v2
 * Routes uploaded grids through the correct specialist parser based on layout detection.
 *
 * Pipeline:
 *   1. layoutDetector.classify(gridRows) → LayoutType + confidence
 *   2. Route to correct specialist parser:
 *        MATRIX_H / MATRIX_V → matrixParser
 *        LINEAR              → columnMapper (existing)
 *        SECTIONED           → sectionedParser
 *        UNKNOWN / low conf  → aiParser (OpenRouter free-tier fallback)
 *   3. Best result (highest event count) wins
 *   4. Behavioral Science normalization pass
 *   5. Dual-level chronological sort (Date → Time)
 */

import { ScheduleEvent } from '../types';
import { parseScheduleWithAI } from './aiParser';
import { parseGridTimetable } from './gridParser';
import { parseMultidirectionalGrid } from './multidirectionalParser';
import { behavioralEngineInstance } from './behavioralEngine';
import { classifyEventCategory } from './categorizer';
import { detectLayout, LayoutDetection } from './layoutDetector';
import { parseMatrixTimetable } from './matrixParser';
import { parseSectionedText, gridToSectionedText } from './sectionedParser';
import { analyzeGridStructure, parseGridWithMapping } from './columnMapper';

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

function normalizeIsoDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const str = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const spaceMatch = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?$/);
  if (spaceMatch) {
    const day = parseInt(spaceMatch[1], 10);
    const mStr = spaceMatch[2].toLowerCase();
    const yr = spaceMatch[3] || String(new Date().getFullYear());
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dashMatch = str.match(/^(\d{1,2})[-/.]([\w]{2,9})[-/.](\d{2,4})$/);
  if (dashMatch) {
    const day = parseInt(dashMatch[1], 10);
    const mPart = dashMatch[2].toLowerCase();
    let yr = dashMatch[3];
    if (yr.length === 2) yr = `20${yr}`;
    let month = parseInt(mPart, 10);
    if (isNaN(month)) month = MONTH_MAP[mPart] || 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return undefined;
}

function parseTimeTo24h(timeStr?: string): string {
  if (!timeStr) return '09:00';
  const cleaned = timeStr.trim().toLowerCase();
  const match = cleaned.match(/\b(\d{1,2})[:.h](\d{2})\s*(am|pm)?\b/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const single = cleaned.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (single) {
    let h = parseInt(single[1], 10);
    const ampm = single[2];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }
  return '09:00';
}

function format12hTime(time24h: string): string {
  const [hStr, mStr] = time24h.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${mStr} ${ampm}`;
}

function normalizeEvent(evt: ScheduleEvent): ScheduleEvent {
  const cleanDate = normalizeIsoDate(evt.date) || evt.date;
  const cleanTime = parseTimeTo24h(evt.time);

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
    category: evt.category || classifyEventCategory(evt.title),
  };
}

export interface PipelineResult {
  events: ScheduleEvent[];
  layoutType: string;
  confidence: number;
  aiPowered: boolean;
  parserName: string;
}

/**
 * Agentic Universal Schedule Format Adapter Pipeline
 * Processes any uploaded file text or raw 2D grid rows into a unified, clean, sorted ScheduleEvent[].
 */
export async function runAgenticFormatAdapter(
  rawText: string,
  gridRows?: any[][]
): Promise<ScheduleEvent[]> {
  const result = await runAgenticPipelineWithMeta(rawText, gridRows);
  return result.events;
}

/**
 * Extended version — returns full metadata about the parsing run (for ParseResultPreview UI).
 */
export async function runAgenticPipelineWithMeta(
  rawText: string,
  gridRows?: any[][]
): Promise<PipelineResult> {
  let detection: LayoutDetection = {
    type: 'UNKNOWN', confidence: 0, timeSlotAxis: null, dayAxis: null,
    headerRowIndex: 0, headerColIndex: 0,
  };

  // ── Phase 1: Layout Detection ──────────────────────────────────────────────
  if (gridRows && gridRows.length > 0) {
    detection = detectLayout(gridRows);
  }

  const candidates: Array<{ events: ScheduleEvent[]; name: string; priority: number }> = [];

  // ── Phase 2: Route to specialist parsers ──────────────────────────────────
  if (gridRows && gridRows.length > 0) {

    // Matrix parsers (H and V)
    if (detection.type === 'MATRIX_H' || detection.type === 'MATRIX_V' || detection.confidence >= 50) {
      const matrixEvents = parseMatrixTimetable(gridRows, detection);
      if (matrixEvents && matrixEvents.length > 0) {
        candidates.push({ events: matrixEvents, name: `Matrix (${detection.type})`, priority: detection.confidence });
      }

      // Also try the opposite orientation as fallback
      const oppositeType = detection.type === 'MATRIX_H' ? 'MATRIX_V' : 'MATRIX_H';
      const oppositeDetection: LayoutDetection = {
        ...detection,
        type: oppositeType,
        timeSlotAxis: oppositeType === 'MATRIX_V' ? 'row' : 'col',
        dayAxis: oppositeType === 'MATRIX_V' ? 'col' : 'row',
      };
      const altEvents = parseMatrixTimetable(gridRows, oppositeDetection);
      if (altEvents && altEvents.length > 0) {
        candidates.push({ events: altEvents, name: `Matrix (${oppositeType} fallback)`, priority: detection.confidence - 10 });
      }
    }

    // Sectioned text parser
    if (detection.type === 'SECTIONED' || detection.type === 'UNKNOWN') {
      const sectionedText = gridToSectionedText(gridRows);
      const sectionedEvents = parseSectionedText(sectionedText);
      if (sectionedEvents.length > 0) {
        candidates.push({ events: sectionedEvents, name: 'Sectioned', priority: 70 });
      }
    }

    // Existing grid parsers (linear / date-row / multidirectional)
    const gridEvents = parseGridTimetable(gridRows);
    if (gridEvents && gridEvents.length > 0) {
      candidates.push({ events: gridEvents, name: 'Grid (Date-Row)', priority: 60 });
    }

    const multiEvents = parseMultidirectionalGrid(gridRows);
    if (multiEvents && multiEvents.length > 0) {
      candidates.push({ events: multiEvents, name: 'Multidirectional', priority: 55 });
    }

    // Column mapper (linear)
    if (detection.type === 'LINEAR' || detection.type === 'UNKNOWN') {
      const colAnalysis = analyzeGridStructure(gridRows as string[][]);
      if (colAnalysis.confidenceScore >= 55) {
        const colEvents = parseGridWithMapping(gridRows as string[][], colAnalysis.mapping);
        if (colEvents.length > 0) {
          candidates.push({ events: colEvents, name: 'Linear (Column Mapper)', priority: colAnalysis.confidenceScore });
        }
      }
    }
  }

  // Sectioned parsing from raw text (for text/PDF uploads)
  if (rawText && rawText.length > 20) {
    const sectionedFromText = parseSectionedText(rawText);
    if (sectionedFromText.length > 0) {
      candidates.push({ events: sectionedFromText, name: 'Sectioned (Text)', priority: 50 });
    }
  }

  // ── Phase 3: AI Fallback ──────────────────────────────────────────────────
  let aiPowered = false;
  const localBestCount = candidates.length > 0 ? Math.max(...candidates.map((c) => c.events.length)) : 0;

  if (localBestCount < 3 || detection.type === 'UNKNOWN') {
    const aiResult = await parseScheduleWithAI(rawText, gridRows);
    if (aiResult.events && aiResult.events.length > 0) {
      candidates.push({ events: aiResult.events, name: 'AI (OpenRouter)', priority: 65 });
      if (aiResult.aiPowered) aiPowered = true;
    }
  }

  // ── Phase 4: Pick best candidate (most events, weighted by priority) ──────
  let bestCandidate = candidates.length > 0
    ? candidates.reduce((best, c) => {
        const cScore = c.events.length * 0.7 + c.priority * 0.3;
        const bScore = best.events.length * 0.7 + best.priority * 0.3;
        return cScore > bScore ? c : best;
      })
    : null;

  if (!bestCandidate || bestCandidate.events.length === 0) {
    return {
      events: [],
      layoutType: detection.type,
      confidence: detection.confidence,
      aiPowered: false,
      parserName: 'None',
    };
  }

  // ── Phase 5: Normalization pass ───────────────────────────────────────────
  const normalized = bestCandidate.events.map(normalizeEvent);

  // ── Phase 6: Dual-level chronological sort ────────────────────────────────
  normalized.sort((a, b) => {
    if (a.date && b.date) {
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
    } else if (a.dayOfWeek !== b.dayOfWeek) {
      return (a.dayOfWeek ?? 8) - (b.dayOfWeek ?? 8);
    }
    return a.time.localeCompare(b.time);
  });

  return {
    events: normalized,
    layoutType: detection.type,
    confidence: detection.confidence,
    aiPowered,
    parserName: bestCandidate.name,
  };
}
