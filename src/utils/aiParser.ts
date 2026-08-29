import { ScheduleEvent } from '../types';
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from './aiConfig';
import { parseGridTimetable } from './gridParser';

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12
};

function parseTimeTo24h(timeStr: string): string {
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

function normalizeDateStr(rawDateStr: string): string | undefined {
  if (!rawDateStr) return undefined;
  const str = rawDateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const match = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const mStr = match[2].toLowerCase();
    const currentYear = new Date().getFullYear();
    const yr = match[3] || String(currentYear);
    const month = MONTH_MAP[mStr];
    if (month && day >= 1 && day <= 31) {
      return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

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

  return undefined;
}

export async function parseScheduleWithAI(
  rawText: string,
  fallbackRows?: any[][]
): Promise<{ events: ScheduleEvent[]; aiPowered: boolean; summary?: string }> {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.length < 10) {
    const fallback = fallbackRows ? parseGridTimetable(fallbackRows) || [] : [];
    return { events: fallback, aiPowered: false };
  }

  const promptContent = `
You are an expert AI Cognitive Timetable & Schedule Parsing Engine powered by OpenRouter.
Analyze the following schedule document text and extract ALL scheduled classes, workshops, guest lectures, and sessions.

Input Document Text:
"""
${rawText.slice(0, 10000)}
"""

REQUIREMENTS:
1. Extract ALL scheduled events. Include exact Date (format YYYY-MM-DD e.g. "2026-07-13", "2026-09-02"), Day of Week (1=Monday ... 7=Sunday), 24-hour Start Time (HH:MM e.g. "09:00", "10:00", "11:00", "13:30", "14:00", "14:30"), Course Title, Instructor/Faculty, and Room Venue.
2. If the date is given as "13 July", "14 July", "2 September", assume year 2026. Format cleanly as "YYYY-MM-DD".
3. Categorize each event into one of: 'Deep Work', 'Collaborative', 'Administrative', or 'Wrap-up'.
4. Do NOT assume weekly recurring loops. Every single entry MUST be treated as an exact-date, non-repeating routine event. Preserve all future dates.
5. CRITICAL TIMING RULE: Determine session start times accurately! Column 1 (09.00 AM - 11.00 AM) sessions start at 09:00 (or inline time like 09:15, 09:30). Column 2 (11.00 AM - 01.00 PM) sessions start at 11:00 (or inline time like 10:00, 11:00). Column 3 (02.00 PM - 04.00 PM) sessions start at 14:00 (or inline time like 13:30, 14:30, 14:45). Never default every class to 09:00 AM.
6. SEQUENCE-AGNOSTIC MULTIDIRECTIONAL SCANNING: The file layout may be Top-to-Bottom, Left-to-Right, Transposed, or Non-Standard block sequence. Scan the document in all directions to associate each date anchor with its corresponding time slot, subject title, faculty name, and venue location.

Return strictly valid JSON matching this schema:
{
  "routineTitle": "PhD Coursework Timetable",
  "events": [
    {
      "title": "Research and Publications Ethics",
      "date": "2026-07-14",
      "dayOfWeek": 2,
      "time": "10:00",
      "rawTime": "10:00 AM - 12:00 PM",
      "faculty": "Dr Sangeetha R",
      "venue": "Venue: 628, 6th Floor",
      "category": "Deep Work"
    }
  ]
}
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://my-schedule-app-chi.vercel.app/",
        "X-Title": "My Schedule App OpenRouter AI Parser",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: "You are an AI schedule parser API. Return strictly valid JSON."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("OpenRouter API returned status:", response.status);
      throw new Error(`OpenRouter API status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty AI response content");

    let cleanJsonStr = content.trim();
    if (cleanJsonStr.startsWith("```json")) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    } else if (cleanJsonStr.startsWith("```")) {
      cleanJsonStr = cleanJsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsedData = JSON.parse(cleanJsonStr);
    const rawAiEvents = parsedData.events || [];

    const mappedEvents: ScheduleEvent[] = rawAiEvents.map((e: any) => {
      const formattedDate = normalizeDateStr(e.date) || e.date;
      let dayNum = e.dayOfWeek;
      if (!dayNum && formattedDate) {
        const [y, m, dNum] = formattedDate.split('-').map((x: string) => parseInt(x, 10));
        const dt = new Date(y, m - 1, dNum);
        dayNum = dt.getDay() === 0 ? 7 : dt.getDay();
      }

      return {
        id: Math.random().toString(36).substring(2, 9),
        title: e.title || "Class Session",
        date: formattedDate || undefined,
        dayOfWeek: dayNum || 1,
        time: parseTimeTo24h(e.time || "09:00"),
        rawTime: e.rawTime || e.time || "09:00 AM",
        faculty: e.faculty || undefined,
        venue: e.venue || undefined,
        reminderMinutesBefore: 5,
        category: e.category || "Deep Work"
      };
    });

    if (mappedEvents.length > 0) {
      return {
        events: mappedEvents,
        aiPowered: true,
        summary: parsedData.routineTitle || `OpenRouter AI parsed ${mappedEvents.length} events successfully`
      };
    }
  } catch (err) {
    console.error("OpenRouter AI Parsing Error, falling back to local engine:", err);
  }

  // Fallback to local grid parser
  const fallback = fallbackRows ? parseGridTimetable(fallbackRows) || [] : [];
  return { events: fallback, aiPowered: false };
}
