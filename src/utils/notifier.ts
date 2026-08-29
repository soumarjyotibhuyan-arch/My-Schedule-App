import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ScheduleEvent } from '../types';

// Set up default notification handler for native platforms
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

// Global reference for active web notification instance to update live status seamlessly
let currentActiveWebNotification: any = null;
let lastNotifiedEventId: string | null = null;

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

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    if (currentActiveWebNotification) {
      try {
        currentActiveWebNotification.close();
      } catch (e) {}
      currentActiveWebNotification = null;
    }
    return;
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Helper to format end time (+90 mins)
function getFormattedEndTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  let totalMins = h * 60 + m + 90;
  let endH = Math.floor(totalMins / 60) % 24;
  let endM = totalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// Schedule notifications for a single event (Pre-Class Offset, Live Start Alert, and Class Concluded Alert)
export async function scheduleEventNotification(event: ScheduleEvent): Promise<string[]> {
  const ids: string[] = [];
  if (Platform.OS === 'web') return ids;

  try {
    if (!event.date) return ids;

    const [year, month, day] = event.date.split('-').map((val: string) => parseInt(val, 10));
    const [eventHour, eventMinute] = event.time.split(':').map((val: string) => parseInt(val, 10));

    // Construct start Date (Month is 0-indexed in JS Dates)
    const startDateObj = new Date(year, month - 1, day, eventHour, eventMinute, 0);

    // Calculate end Date (Default 90 minutes class duration)
    const endMinsTotal = eventHour * 60 + eventMinute + 90;
    const endHour = Math.floor(endMinsTotal / 60) % 24;
    const endMinute = endMinsTotal % 60;
    const endDateObj = new Date(year, month - 1, day, endHour, endMinute, 0);

    const endTimeDisplay = event.rawTime || getFormattedEndTime(event.time);

    // 1. Pre-Class Offset Reminder
    const reminderTimeMs = startDateObj.getTime() - event.reminderMinutesBefore * 60000;
    if (reminderTimeMs > Date.now()) {
      const reminderId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ Upcoming Class (${event.reminderMinutesBefore}m prior): ${event.title}`,
          body: `${event.title} starts at ${event.time}${event.venue ? ` in ${event.venue}` : ''}.`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminderTimeMs),
        },
      });
      ids.push(reminderId);
    }

    // 2. Live Class Start Alert (Triggers exact class start time, active notification)
    if (startDateObj.getTime() > Date.now()) {
      const liveId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🟢 LIVE NOW: ${event.title}`,
          body: `Class is currently in session (${endTimeDisplay})${event.venue ? ` at ${event.venue}` : ''}. Active until class ends.`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: startDateObj,
        },
      });
      ids.push(liveId);
    }

    // 3. Class Concluded Alert (Triggers exact class end time to notify completion)
    if (endDateObj.getTime() > Date.now()) {
      const endId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🏁 CLASS CONCLUDED: ${event.title}`,
          body: `${event.title} has finished. Checking next scheduled class routine.`,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: endDateObj,
        },
      });
      ids.push(endId);
    }
  } catch (error) {
    console.error('Error scheduling notification:', error);
  }

  return ids;
}

// Bulk schedule all events
export async function scheduleAllEvents(events: ScheduleEvent[]): Promise<number> {
  await cancelAllNotifications();

  if (Platform.OS === 'web') {
    return events.length;
  }

  let scheduledCount = 0;
  for (const event of events) {
    const ids = await scheduleEventNotification(event);
    if (ids.length > 0) {
      scheduledCount++;
    }
  }

  return scheduledCount;
}

// Live Dynamic Web/Desktop Notification Sync Function
// Called on live ticks to display and sustain sticky notifications during active class sessions
export function updateLiveNotificationState(
  ongoingEvent: ScheduleEvent | null,
  nextUpEvent: ScheduleEvent | null
): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  // Scenario A: Class is CURRENTLY ONGOING -> Display Sticky Live Notification
  if (ongoingEvent) {
    const eventKey = `ongoing-${ongoingEvent.id || ongoingEvent.title}-${ongoingEvent.time}`;
    if (lastNotifiedEventId !== eventKey) {
      lastNotifiedEventId = eventKey;
      if (currentActiveWebNotification) {
        try { currentActiveWebNotification.close(); } catch (e) {}
      }

      const timeRange = ongoingEvent.rawTime || `${ongoingEvent.time} - ${getFormattedEndTime(ongoingEvent.time)}`;
      currentActiveWebNotification = new (window as any).Notification(`🟢 LIVE NOW: ${ongoingEvent.title}`, {
        body: `⏰ Active Time: ${timeRange}\n📍 Location: ${ongoingEvent.venue || 'Campus Classroom'}\n⚡ Status: Currently in progress until class ends.`,
        tag: 'schedule-sync-live-status',
        renotify: true,
        requireInteraction: true, // Keeps sticky live notification visible until class ends
      });
    }
  } 
  // Scenario B: Class just finished & Next Up Class is upcoming -> Display Transition Notification
  else if (nextUpEvent) {
    const eventKey = `next-${nextUpEvent.id || nextUpEvent.title}-${nextUpEvent.time}`;
    if (lastNotifiedEventId !== eventKey && lastNotifiedEventId?.startsWith('ongoing-')) {
      lastNotifiedEventId = eventKey;
      if (currentActiveWebNotification) {
        try { currentActiveWebNotification.close(); } catch (e) {}
      }

      currentActiveWebNotification = new (window as any).Notification(`⚡ NEXT CLASS UP: ${nextUpEvent.title}`, {
        body: `⏰ Scheduled at ${nextUpEvent.time}${nextUpEvent.venue ? ` in ${nextUpEvent.venue}` : ''}. Get ready!`,
        tag: 'schedule-sync-live-status',
        renotify: true,
        requireInteraction: false,
      });
    }
  } 
  // Scenario C: No active or upcoming classes -> Clear sticky notification
  else {
    if (currentActiveWebNotification) {
      try { currentActiveWebNotification.close(); } catch (e) {}
      currentActiveWebNotification = null;
    }
    lastNotifiedEventId = null;
  }
}
