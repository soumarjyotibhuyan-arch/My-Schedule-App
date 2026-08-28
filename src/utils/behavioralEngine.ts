export interface BehavioralMemoryItem {
  vividness: number; // 0.0 - 10.0 scale
  count: number; // Historical frequency count seen in schedule
  prototypeSubject?: string;
  prototypeFaculty?: string;
  prototypeVenue?: string;
}

export interface ClassPrototype {
  keywords: string[];
  subject: string;
  faculty: string;
  venue?: string;
  defaultTime?: string;
}

export class BehavioralEngine {
  private vividMemoryBank: Map<string, BehavioralMemoryItem> = new Map();
  private classPrototypes: ClassPrototype[] = [
    {
      keywords: ['ethics', 'publication', 'sangeetha', 'research ethics'],
      subject: 'Research and Publications Ethics',
      faculty: 'Dr Sangeetha R',
      venue: 'Venue: 628, 6th Floor',
      defaultTime: '10:00 AM - 12:00 PM',
    },
    {
      keywords: ['foundations', 'writing', 'sumathi', 'elangovan', 'research writing'],
      subject: 'Foundations of Research and Research Writing',
      faculty: 'Dr Sumathi',
      venue: 'Venue: 628, 6th Floor',
      defaultTime: '02:00 PM - 04:00 PM',
    },
    {
      keywords: ['methods', 'manoharan', 'manoj', 'social sciences', 'sciences'],
      subject: 'Methods in Research',
      faculty: 'Dr Manoharan N / Dr Manoj B',
      venue: 'Venue: 628 / Venue: 05',
      defaultTime: '11:00 AM - 01:00 PM',
    },
    {
      keywords: ['wellbeing', 'deepa', 'health', 'session'],
      subject: 'Wellbeing Session',
      faculty: 'Ms Deepa Venukumar',
      venue: 'Venue: 628, 6th Floor',
      defaultTime: '11:00 AM - 12:30 PM',
    },
    {
      keywords: ['colloquium', 'social science', 'icssr', 'ke auditorium'],
      subject: 'CAG-ICSSR Colloquium for Scholars',
      faculty: 'KE Auditorium Panel',
      venue: 'KE Auditorium',
      defaultTime: '10:00 AM - 12:00 PM',
    }
  ];

  /**
   * 1. Availability Heuristic:
   * Calculates availability score based on vividness & historical frequency.
   * perceived_weight = (vividness * 0.7) + (count * 0.3)
   */
  public availabilityHeuristic(subjectKey: string): number {
    const memory = this.vividMemoryBank.get(subjectKey.toLowerCase()) || { vividness: 5.0, count: 1 };
    const score = (memory.vividness * 0.7) + (memory.count * 0.3);
    return Math.min(score, 10.0);
  }

  /**
   * Record seen memory item to train availability bank dynamically.
   */
  public recordAvailability(subjectKey: string, faculty?: string, venue?: string) {
    const key = subjectKey.toLowerCase().trim();
    const existing = this.vividMemoryBank.get(key) || { vividness: 7.0, count: 0 };
    existing.count += 1;
    if (faculty) existing.prototypeFaculty = faculty;
    if (venue) existing.prototypeVenue = venue;
    this.vividMemoryBank.set(key, existing);
  }

  /**
   * 2. Representativeness Heuristic:
   * Matches ambiguous or incomplete text features against known class prototypes.
   * Returns prototype match percentage (0% - 100%).
   */
  public representativenessHeuristic(cellText: string): {
    matchedPrototype: ClassPrototype | null;
    matchPercentage: number;
  } {
    const textLower = cellText.toLowerCase();
    let bestMatch: ClassPrototype | null = null;
    let maxMatchRatio = 0;

    for (const proto of this.classPrototypes) {
      let matches = 0;
      for (const kw of proto.keywords) {
        if (textLower.includes(kw)) {
          matches++;
        }
      }
      const matchRatio = matches / proto.keywords.length;
      if (matchRatio > maxMatchRatio) {
        maxMatchRatio = matchRatio;
        bestMatch = proto;
      }
    }

    return {
      matchedPrototype: maxMatchRatio >= 0.25 ? bestMatch : null,
      matchPercentage: Math.round(maxMatchRatio * 100)
    };
  }

  /**
   * 3. Anchoring & Adjustment Heuristic:
   * Simulates adjusting from a standard session anchor time (e.g. 09:00 AM)
   * to an adjusted time based on explicit or implied offsets.
   * anchor + ((actual_value - anchor) * adjustment_tendency)
   */
  public anchoringAdjustmentHeuristic(
    anchorHour: number,
    actualHour: number,
    adjustmentTendency: number = 0.5
  ): number {
    const rawAdjustment = (actualHour - anchorHour) * adjustmentTendency;
    return anchorHour + rawAdjustment;
  }

  /**
   * Infer missing information from messy or incomplete text using behavioral heuristics.
   */
  public inferMissingInformation(cellText: string, currentFaculty?: string, currentVenue?: string): {
    inferredSubject: string;
    inferredFaculty?: string;
    inferredVenue?: string;
    inferredTime?: string;
    heuristicUsed: string;
  } {
    const repResult = this.representativenessHeuristic(cellText);
    
    if (repResult.matchedPrototype && repResult.matchPercentage >= 25) {
      const proto = repResult.matchedPrototype;
      return {
        inferredSubject: proto.subject,
        inferredFaculty: currentFaculty || proto.faculty,
        inferredVenue: currentVenue || proto.venue,
        inferredTime: proto.defaultTime,
        heuristicUsed: `Representativeness Heuristic (${repResult.matchPercentage}% match)`
      };
    }

    const availScore = this.availabilityHeuristic(cellText);
    const keyLower = cellText.toLowerCase().trim();
    const memory = this.vividMemoryBank.get(keyLower);

    if (memory && availScore > 4.0) {
      return {
        inferredSubject: cellText,
        inferredFaculty: currentFaculty || memory.prototypeFaculty,
        inferredVenue: currentVenue || memory.prototypeVenue,
        heuristicUsed: `Availability Heuristic (Score: ${availScore.toFixed(1)})`
      };
    }

    return {
      inferredSubject: cellText,
      inferredFaculty: currentFaculty,
      inferredVenue: currentVenue,
      heuristicUsed: 'Direct Parsing'
    };
  }
}

export const behavioralEngineInstance = new BehavioralEngine();
