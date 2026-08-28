export interface ScheduleEvent {
  id: string; // Unique identifier for the event
  title: string; // Event title (e.g., "Algebra Lecture")
  date?: string; // YYYY-MM-DD for one-off calendar events
  dayOfWeek?: number; // 1 (Monday) to 7 (Sunday) for weekly repeating schedule
  time: string; // 24-hour format "HH:MM" (e.g., "14:30")
  description?: string; // Description or location (optional)
  venue?: string; // Extracted venue/room location (e.g. "Venue: 628, 6th Floor")
  faculty?: string; // Instructor/Faculty name (e.g. "Dr Sangeetha R")
  reminderMinutesBefore: number; // Notification lead time (in minutes, default 5)
  category?: 'Deep Work' | 'Collaborative' | 'Administrative' | 'Wrap-up'; // Cognitive load category
  rawTime?: string; // Original raw time string from the uploaded file
}
