import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ScheduleEvent } from '../types';

// Set up the default notification handler (native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Request notifications permissions from user (compatible with native and web)
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'granted') return true;
      const status = await window.Notification.requestPermission();
      return status === 'granted';
    }
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  // Set up notification channel for Android (required for high-priority alerts)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('schedule-alerts', {
      name: 'Timetable Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return true;
}

// Map dayOfWeek (1 = Monday, 7 = Sunday) to Expo's trigger weekday (1 = Sunday, 2 = Monday, ..., 7 = Saturday)
function getExpoWeekday(dayOfWeek1to7: number): number {
  if (dayOfWeek1to7 === 7) return 1; // Sunday
  return dayOfWeek1to7 + 1; // Monday -> 2, Tuesday -> 3, etc.
}

// Calculate the trigger hour and minute based on event time and reminder offset
function calculateTriggerTime(timeStr: string, offsetMins: number): { hour: number; minute: number; offsetDays: number } {
  const [hourStr, minuteStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  let minute = parseInt(minuteStr, 10);

  // Subtract offset
  minute -= offsetMins;
  let offsetDays = 0;

  // Handle underflows
  while (minute < 0) {
    minute += 60;
    hour -= 1;
  }
  while (hour < 0) {
    hour += 24;
    offsetDays -= 1; // Trigger on the previous day
  }

  return { hour, minute, offsetDays };
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Schedule notification for a single event
export async function scheduleEventNotification(event: ScheduleEvent): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { hour, minute, offsetDays } = calculateTriggerTime(event.time, event.reminderMinutesBefore);

    // 1. Weekly repeating notification
    if (event.dayOfWeek !== undefined) {
      let targetWeekday = getExpoWeekday(event.dayOfWeek);

      // Adjust weekday if reminder offset pushed it to the previous day
      if (offsetDays < 0) {
        targetWeekday = targetWeekday - 1;
        if (targetWeekday < 1) targetWeekday = 7; // Wrap back to Saturday (7) if it was Sunday (1)
      }

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: event.description || `${event.title} starts in ${event.reminderMinutesBefore} minutes at ${event.time}!`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          weekday: targetWeekday,
          hour,
          minute,
          repeats: true,
        },
      });
      return id;
    }

    // 2. One-off date-specific notification
    if (event.date) {
      const [year, month, day] = event.date.split('-').map(x => parseInt(x, 10));
      const [eventHour, eventMinute] = event.time.split(':').map(x => parseInt(x, 10));

      // Construct date (Month is 0-indexed in JS Dates)
      const eventDateObj = new Date(year, month - 1, day, eventHour, eventMinute, 0);
      const triggerTimeMs = eventDateObj.getTime() - event.reminderMinutesBefore * 60000;
      const triggerDate = new Date(triggerTimeMs);

      // Only schedule if the trigger time is in the future
      if (triggerDate.getTime() > Date.now()) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: event.title,
            body: event.description || `${event.title} starts in ${event.reminderMinutesBefore} minutes at ${event.time}!`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });
        return id;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error scheduling notification for event ${event.title}:`, error);
    return null;
  }
}

// Bulk schedule all events
export async function scheduleAllEvents(events: ScheduleEvent[]): Promise<number> {
  // First, clear existing notifications to prevent duplicates
  await cancelAllNotifications();

  if (Platform.OS === 'web') {
    // On the web, since background offline scheduling isn't natively supported,
    // we bypass notification registration but return the count of events imported.
    return events.length;
  }

  let scheduledCount = 0;
  for (const event of events) {
    const notificationId = await scheduleEventNotification(event);
    if (notificationId) {
      scheduledCount++;
    }
  }

  return scheduledCount;
}
