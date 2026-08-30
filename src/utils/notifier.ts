import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ScheduleEvent } from '../types';

// Set up default notification handler for native platforms (Foreground + Background)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
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
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (window.Notification.permission === 'granted') return true;
        if (window.Notification.permission === 'denied') return false;
        
        // Wrap requestPermission in catch to prevent iOS Mobile Safari user-gesture crashes
        const status = await window.Notification.requestPermission().catch((err) => {
          console.warn('Mobile browser user-gesture required for notifications:', err);
          return 'default';
        });
        return status === 'granted';
      }
    } catch (e) {
      console.warn('Notification permission error on mobile browser:', e);
      return false;
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

  // Set up notification channel for Android (required for high-priority alerts & NoiseFit smartwatch mirroring)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('schedule-alerts', {
      name: 'RoutineSync Timetable Alarms',
      description: 'High-priority routine and class alarms pushed to mobile and Noise smartwatch.',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFF384',
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
    });
  }

  return true;
}

let activeWebTimers: any[] = [];

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  if (currentActiveWebNotification) {
    try {
      currentActiveWebNotification.close();
    } catch (e) {}
    currentActiveWebNotification = null;
  }

  // Clear all pending web background timers
  activeWebTimers.forEach(timer => clearTimeout(timer));
  activeWebTimers = [];

  if (Platform.OS !== 'web') {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
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

// Calculate target Date for weekly repeating days of week (1=Mon ... 7=Sun)
function getNextDateForDayOfWeek(dayOfWeek: number, targetHour: number, targetMinute: number): Date {
  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // 1 (Mon) .. 7 (Sun)
  let daysToAdd = (dayOfWeek - currentDay + 7) % 7;

  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, targetHour, targetMinute, 0);
  if (targetDate.getTime() <= now.getTime()) {
    targetDate.setDate(targetDate.getDate() + 7);
  }
  return targetDate;
}

// Schedule notifications for a single event (Pre-Class Offset, Live Start Alert, and Class Concluded Alert)
export async function scheduleEventNotification(event: ScheduleEvent): Promise<string[]> {
  const ids: string[] = [];

  try {
    const [eventHour, eventMinute] = event.time.split(':').map((val: string) => parseInt(val, 10));
    let startDateObj: Date | null = null;

    if (event.date) {
      const [year, month, day] = event.date.split('-').map((val: string) => parseInt(val, 10));
      startDateObj = new Date(year, month - 1, day, eventHour, eventMinute, 0);
    } else if (event.dayOfWeek !== undefined && event.dayOfWeek >= 1 && event.dayOfWeek <= 7) {
      startDateObj = getNextDateForDayOfWeek(event.dayOfWeek, eventHour, eventMinute);
    }

    if (!startDateObj) return ids;

    // Calculate end Date (Default 90 minutes class duration)
    const endDateObj = new Date(startDateObj.getTime() + 90 * 60000);
    const endTimeDisplay = event.rawTime || getFormattedEndTime(event.time);

    // WEB / PWA MOBILE SCHEDULING PIPELINE
    if (Platform.OS === 'web') {
      const nowMs = Date.now();

      // 1. Pre-Class Offset Reminder
      const reminderTimeMs = startDateObj.getTime() - event.reminderMinutesBefore * 60000;
      if (reminderTimeMs > nowMs) {
        const delayMs = reminderTimeMs - nowMs;
        if (delayMs <= 2147483647) {
          const timer = setTimeout(() => {
            triggerWebNotification(`⏰ Upcoming Class (${event.reminderMinutesBefore}m prior): ${event.title}`, {
              body: `${event.title} starts at ${event.time}${event.venue ? ` in ${event.venue}` : ''}.`,
              tag: `reminder-${event.id || event.title}`,
              renotify: true,
            });
          }, delayMs);
          activeWebTimers.push(timer);
          ids.push(`web-reminder-${event.id || event.title}`);
        }
      }

      // 2. Live Class Start Alert
      if (startDateObj.getTime() > nowMs) {
        const delayMs = startDateObj.getTime() - nowMs;
        if (delayMs <= 2147483647) {
          const timer = setTimeout(() => {
            triggerWebNotification(`🟢 LIVE NOW: ${event.title}`, {
              body: `Class is currently in session (${endTimeDisplay})${event.venue ? ` at ${event.venue}` : ''}.`,
              tag: `start-${event.id || event.title}`,
              renotify: true,
              requireInteraction: true,
            });
          }, delayMs);
          activeWebTimers.push(timer);
          ids.push(`web-start-${event.id || event.title}`);
        }
      }

      // 3. Class Concluded Alert
      if (endDateObj.getTime() > nowMs) {
        const delayMs = endDateObj.getTime() - nowMs;
        if (delayMs <= 2147483647) {
          const timer = setTimeout(() => {
            triggerWebNotification(`🏁 CLASS CONCLUDED: ${event.title}`, {
              body: `${event.title} has finished. Checking next scheduled class routine.`,
              tag: `end-${event.id || event.title}`,
              renotify: true,
            });
          }, delayMs);
          activeWebTimers.push(timer);
          ids.push(`web-end-${event.id || event.title}`);
        }
      }

      return ids;
    }

    // NATIVE PLATFORMS (ANDROID / IOS)
    const baseContent = {
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250],
      ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
    };

    // 1. Pre-Class Offset Reminder
    const reminderTimeMs = startDateObj.getTime() - event.reminderMinutesBefore * 60000;
    if (reminderTimeMs > Date.now()) {
      const reminderId = await Notifications.scheduleNotificationAsync({
        content: {
          ...baseContent,
          title: `⏰ Upcoming Class (${event.reminderMinutesBefore}m prior): ${event.title}`,
          body: `${event.title} starts at ${event.time}${event.venue ? ` in ${event.venue}` : ''}.`,
        },
        trigger: {
          date: reminderTimeMs,
          ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
        } as any,
      });
      ids.push(reminderId);
    }

    // 2. Live Class Start Alert
    if (startDateObj.getTime() > Date.now()) {
      const liveId = await Notifications.scheduleNotificationAsync({
        content: {
          ...baseContent,
          title: `🟢 LIVE NOW: ${event.title}`,
          body: `Class is currently in session (${endTimeDisplay})${event.venue ? ` at ${event.venue}` : ''}.`,
        },
        trigger: {
          date: startDateObj.getTime(),
          ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
        } as any,
      });
      ids.push(liveId);
    }

    // 3. Class Concluded Alert
    if (endDateObj.getTime() > Date.now()) {
      const endId = await Notifications.scheduleNotificationAsync({
        content: {
          ...baseContent,
          title: `🏁 CLASS CONCLUDED: ${event.title}`,
          body: `${event.title} has finished. Checking next scheduled class routine.`,
        },
        trigger: {
          date: endDateObj.getTime(),
          ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
        } as any,
      });
      ids.push(endId);
    }
  } catch (error) {
    console.error('Error scheduling mobile notification:', error);
  }

  return ids;
}

// Bulk schedule all events
export async function scheduleAllEvents(events: ScheduleEvent[]): Promise<number> {
  await cancelAllNotifications();

  let scheduledCount = 0;
  for (const event of events) {
    const ids = await scheduleEventNotification(event);
    if (ids.length > 0) {
      scheduledCount++;
    }
  }

  return scheduledCount;
}

function triggerWebNotification(title: string, options: any): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '/';

  // PRIMARY: Route notification through active Service Worker via postMessage
  // This is the only reliable way to show notifications on Android Chrome / iOS Safari PWA
  if ('serviceWorker' in navigator && navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      options: {
        body: options.body || '',
        tag: options.tag || 'routinesync-schedule-alert',
        requireInteraction: options.requireInteraction || false,
        dataUrl: currentUrl,
        renotify: options.renotify !== false,
      },
    });
    return;
  }

  // FALLBACK: Wait for SW to become active then postMessage
  if ('serviceWorker' in navigator && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.active) {
        registration.active.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: {
            body: options.body || '',
            tag: options.tag || 'routinesync-schedule-alert',
            requireInteraction: options.requireInteraction || false,
            dataUrl: currentUrl,
            renotify: options.renotify !== false,
          },
        });
      } else {
        // Last resort: desktop browser Notification API only (does not work on mobile Chrome)
        try {
          currentActiveWebNotification = new (window as any).Notification(title, {
            body: options.body || '',
            icon: '/icon.png',
            badge: '/icon.png',
            tag: options.tag || 'routinesync-schedule-alert',
          });
        } catch (e) {}
      }
    }).catch(() => {});
    return;
  }

  // No service worker support — desktop fallback only
  try {
    currentActiveWebNotification = new (window as any).Notification(title, {
      body: options.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
    });
  } catch (e) {}
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
      triggerWebNotification(`🟢 LIVE NOW: ${ongoingEvent.title}`, {
        body: `⏰ Active Time: ${timeRange}\n📍 Location: ${ongoingEvent.venue || 'Campus Classroom'}\n⚡ Status: Currently in progress until class ends.`,
        tag: 'schedule-sync-live-status',
        renotify: true,
        requireInteraction: true,
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

      triggerWebNotification(`⚡ NEXT CLASS UP: ${nextUpEvent.title}`, {
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

// Instant Test Notification function to verify hardware sound, vibration, and system alerts
export async function sendInstantTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  if (Platform.OS === 'web') {
    triggerWebNotification('🔔 RoutineSync Test Notification', {
      body: '🎉 Notifications are working perfectly! Live class reminders will alert on your phone and smartwatch.',
      tag: 'routinesync-test-notification',
      renotify: true,
      requireInteraction: false,
    });
    return true;
  } else {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 RoutineSync Test Notification',
        body: '🎉 Notifications are working perfectly! Live class reminders will alert on your phone and smartwatch.',
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
      },
      trigger: null,
    });
    return true;
  }
}
