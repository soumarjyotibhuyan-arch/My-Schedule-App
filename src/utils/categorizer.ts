import { ScheduleEvent } from '../types';

export function classifyEventCategory(title: string): 'Deep Work' | 'Collaborative' | 'Administrative' | 'Wrap-up' {
  const lower = title.toLowerCase();

  const isCollaborative = 
    lower.includes('with dr') ||
    lower.includes('with prof') ||
    /\b(dr|prof)\b/i.test(lower) ||
    lower.includes('lecture') ||
    lower.includes('class') ||
    lower.includes('seminar') ||
    lower.includes('meeting') ||
    lower.includes('session') ||
    lower.includes('presentation') ||
    lower.includes('discussion') ||
    lower.includes('faculty');

  const isDeepWork =
    lower.includes('thesis') ||
    lower.includes('writing') ||
    lower.includes('drafting') ||
    lower.includes('study') ||
    lower.includes('research') ||
    lower.includes('coding') ||
    lower.includes('project') ||
    lower.includes('reading') ||
    lower.includes('independent') ||
    lower.includes('assignment');

  const isAdministrative =
    lower.includes('email') ||
    lower.includes('admin') ||
    lower.includes('schedule') ||
    lower.includes('timetable') ||
    lower.includes('setup') ||
    lower.includes('register') ||
    lower.includes('inbox') ||
    lower.includes('organization') ||
    lower.includes('paperwork');

  const isWrapUp =
    lower.includes('wrap') ||
    (lower.includes('plan') && lower.includes('tomorrow')) ||
    (lower.includes('review') && lower.includes('tomorrow')) ||
    lower.includes('close') ||
    lower.includes('summary');

  if (lower.includes('with dr') || lower.includes('with prof') || /\b(dr|prof)\b/i.test(lower)) {
    return 'Collaborative';
  }

  if (isWrapUp) {
    return 'Wrap-up';
  }

  if (isAdministrative) {
    return 'Administrative';
  }

  if (isDeepWork) {
    return 'Deep Work';
  }

  if (isCollaborative) {
    return 'Collaborative';
  }

  return 'Collaborative';
}

export function getDefaultTimeForCategory(category: 'Deep Work' | 'Collaborative' | 'Administrative' | 'Wrap-up'): string {
  switch (category) {
    case 'Deep Work':
      return '09:00'; // Morning focus: 8:30 AM - 11:30 AM
    case 'Collaborative':
      return '12:00'; // Midday: 11:30 AM - 1:30 PM
    case 'Administrative':
      return '14:00'; // Early Afternoon: 1:30 PM - 3:30 PM
    case 'Wrap-up':
      return '16:30'; // Late Afternoon: 3:30 PM - 5:00 PM
  }
}
