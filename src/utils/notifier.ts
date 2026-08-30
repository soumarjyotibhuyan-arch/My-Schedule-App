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

// ─── STATE ────────────────────────────────────────────────────────────────────
let lastNotifiedEventId: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      if (window.Notification.permission === 'granted') return true;
      if (window.Notification.permission === 'denied') return false;

      const status = await window.Notification.requestPermission().catch(() => 'default');
      return status === 'granted';
    } catch (e) {
      return false;
    }
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return false;

  // Android notification channel for high-priority alerts & NoiseFit smartwatch
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getFormattedEndTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  const totalMins = h * 60 + m + 90;
  return `${String(Math.floor(totalMins / 60) % 24).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

function getNextDateForDayOfWeek(dayOfWeek: number, h: number, m: number): Date {
  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();
  let daysToAdd = (dayOfWeek - currentDay + 7) % 7;
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, h, m, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 7);
  return target;
}

// ─── SW COMMUNICATION ─────────────────────────────────────────────────────────
/**
 * Get the active Service Worker registration (waits for ready state).
 * Returns null if SW is not available.
 */
async function getActiveSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

/**
 * Post a message to the active Service Worker controller.
 * Falls back to registration.active if controller is null.
 */
async function postToSW(message: object): Promise<boolean> {
  try {
    const reg = await getActiveSW();
    if (!reg) return false;

    const target = navigator.serviceWorker.controller || reg.active || reg.waiting;
    if (!target) return false;

    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Show an immediate notification via the Service Worker.
 * This is the ONLY reliable way to show notifications on Android Chrome & iOS Safari PWA.
 */
async function showNotificationViaSW(title: string, options: {
  body: string;
  tag: string;
  requireInteraction?: boolean;
  renotify?: boolean;
}): Promise<void> {
  const sent = await postToSW({
    type: 'SHOW_NOTIFICATION',
    title,
    options: {
      body: options.body,
      tag: options.tag,
      requireInteraction: options.requireInteraction || false,
      renotify: options.renotify !== false,
    },
  });

  // Desktop-only fallback (does NOT work on mobile Chrome or iOS)
  if (!sent && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
    try {
      new (window as any).Notification(title, {
        body: options.body,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: options.tag,
      });
    } catch {}
  }
}

/**
 * Send the full list of upcoming alarms to the Service Worker alarm store.
 * The SW checks these every 30 seconds and fires them at the right time.
 * This survives tab/app switching (but not full browser close).
 */
async function scheduleAlarmsInSW(alarms: Array<{
  fireAt: number;
  title: string;
  body: string;
  tag: string;
  requireInteraction?: boolean;
}>): Promise<void> {
  await postToSW({ type: 'SCHEDULE_ALARM', alarms });
}

async function cancelAlarmsInSW(): Promise<void> {
  await postToSW({ type: 'CANCEL_ALARMS' });
}

/**
 * Send a heartbeat TICK to the SW so it checks alarms immediately.
 * Called every 15 seconds from the live ticker in index.tsx via updateLiveNotificationState.
 */
export async function tickSWAlarmCheck(): Promise<void> {
  if (Platform.OS !== 'web') return;
  await postToSW({ type: 'TICK' });
}

// ─── CANCEL ALL ───────────────────────────────────────────────────────────────
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    await cancelAlarmsInSW();
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    return;
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// ─── SCHEDULE SINGLE EVENT ────────────────────────────────────────────────────
export async function scheduleEventNotification(event: ScheduleEvent): Promise<string[]> {
  const ids: string[] = [];
  try {
    const [eventHour, eventMinute] = event.time.split(':').map((v) => parseInt(v, 10));
    let startDateObj: Date | null = null;

    if (event.date) {
      const [year, month, day] = event.date.split('-').map((v) => parseInt(v, 10));
      startDateObj = new Date(year, month - 1, day, eventHour, eventMinute, 0);
    } else if (event.dayOfWeek !== undefined && event.dayOfWeek >= 1 && event.dayOfWeek <= 7) {
      startDateObj = getNextDateForDayOfWeek(event.dayOfWeek, eventHour, eventMinute);
    }

    if (!startDateObj) return ids;

    // Native platforms — use expo-notifications scheduled alarms
    if (Platform.OS !== 'web') {
      const endDateObj = new Date(startDateObj.getTime() + 90 * 60000);
      const endTimeDisplay = event.rawTime || getFormattedEndTime(event.time);
      const baseContent = {
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
      };

      const reminderTimeMs = startDateObj.getTime() - event.reminderMinutesBefore * 60000;
      if (reminderTimeMs > Date.now()) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            ...baseContent,
            title: `⏰ Class in ${event.reminderMinutesBefore}m: ${event.title}`,
            body: `${event.title} starts at ${event.time}${event.venue ? ` in ${event.venue}` : ''}.`,
          },
          trigger: { date: reminderTimeMs, ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}) } as any,
        });
        ids.push(id);
      }
      if (startDateObj.getTime() > Date.now()) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            ...baseContent,
            title: `🟢 LIVE NOW: ${event.title}`,
            body: `Class in session until ${endTimeDisplay}${event.venue ? ` at ${event.venue}` : ''}.`,
          },
          trigger: { date: startDateObj.getTime(), ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}) } as any,
        });
        ids.push(id);
      }
      if (endDateObj.getTime() > Date.now()) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            ...baseContent,
            title: `🏁 Class Done: ${event.title}`,
            body: `${event.title} has finished.`,
          },
          trigger: { date: endDateObj.getTime(), ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}) } as any,
        });
        ids.push(id);
      }
      return ids;
    }

    // Web / PWA — return alarm descriptors (collected in scheduleAllEvents)
    const endDateObj = new Date(startDateObj.getTime() + 90 * 60000);
    const endTimeDisplay = event.rawTime || getFormattedEndTime(event.time);
    const nowMs = Date.now();

    const reminderTimeMs = startDateObj.getTime() - event.reminderMinutesBefore * 60000;
    if (reminderTimeMs > nowMs) {
      ids.push(JSON.stringify({
        fireAt: reminderTimeMs,
        title: `⏰ Class in ${event.reminderMinutesBefore}m: ${event.title}`,
        body: `${event.title} starts at ${event.time}${event.venue ? ` in ${event.venue}` : ''}.`,
        tag: `reminder-${event.id || event.title}`,
        requireInteraction: false,
      }));
    }
    if (startDateObj.getTime() > nowMs) {
      ids.push(JSON.stringify({
        fireAt: startDateObj.getTime(),
        title: `🟢 LIVE NOW: ${event.title}`,
        body: `Class in session until ${endTimeDisplay}${event.venue ? ` at ${event.venue}` : ''}.`,
        tag: `start-${event.id || event.title}`,
        requireInteraction: true,
      }));
    }
    if (endDateObj.getTime() > nowMs) {
      ids.push(JSON.stringify({
        fireAt: endDateObj.getTime(),
        title: `🏁 Class Done: ${event.title}`,
        body: `${event.title} has finished.`,
        tag: `end-${event.id || event.title}`,
        requireInteraction: false,
      }));
    }
  } catch (err) {
    console.error('scheduleEventNotification error:', err);
  }
  return ids;
}

// ─── SCHEDULE ALL EVENTS ──────────────────────────────────────────────────────
export async function scheduleAllEvents(events: ScheduleEvent[]): Promise<number> {
  await cancelAllNotifications();

  if (Platform.OS !== 'web') {
    let count = 0;
    for (const event of events) {
      const ids = await scheduleEventNotification(event);
      if (ids.length > 0) count++;
    }
    return count;
  }

  // Web: collect all alarm descriptors then send as one batch to SW
  const alarms: any[] = [];
  for (const event of events) {
    const ids = await scheduleEventNotification(event);
    for (const idJson of ids) {
      try { alarms.push(JSON.parse(idJson)); } catch {}
    }
  }

  if (alarms.length > 0) {
    await scheduleAlarmsInSW(alarms);
  }

  return events.length;
}

// ─── LIVE NOTIFICATION STATE ──────────────────────────────────────────────────
export function updateLiveNotificationState(
  ongoingEvent: ScheduleEvent | null,
  nextUpEvent: ScheduleEvent | null
): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  // Send heartbeat TICK to SW every call so the SW can check its alarm store
  tickSWAlarmCheck();

  if (ongoingEvent) {
    const eventKey = `ongoing-${ongoingEvent.id || ongoingEvent.title}-${ongoingEvent.time}`;
    if (lastNotifiedEventId !== eventKey) {
      lastNotifiedEventId = eventKey;
      const timeRange = ongoingEvent.rawTime || `${ongoingEvent.time} – ${getFormattedEndTime(ongoingEvent.time)}`;
      showNotificationViaSW(`🟢 LIVE NOW: ${ongoingEvent.title}`, {
        body: `⏰ ${timeRange}  📍 ${ongoingEvent.venue || 'Campus Classroom'}`,
        tag: 'schedule-sync-live-status',
        renotify: true,
        requireInteraction: true,
      });
    }
  } else if (nextUpEvent) {
    const eventKey = `next-${nextUpEvent.id || nextUpEvent.title}-${nextUpEvent.time}`;
    if (lastNotifiedEventId !== eventKey && lastNotifiedEventId?.startsWith('ongoing-')) {
      lastNotifiedEventId = eventKey;
      showNotificationViaSW(`⚡ NEXT: ${nextUpEvent.title}`, {
        body: `Starts at ${nextUpEvent.time}${nextUpEvent.venue ? ` in ${nextUpEvent.venue}` : ''}. Get ready!`,
        tag: 'schedule-sync-live-status',
        renotify: true,
        requireInteraction: false,
      });
    }
  } else {
    lastNotifiedEventId = null;
  }
}

// ─── TEST NOTIFICATION ────────────────────────────────────────────────────────
export async function sendInstantTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  if (Platform.OS === 'web') {
    await showNotificationViaSW('🔔 RoutineSync Test', {
      body: '✅ Notifications working! Schedule alerts will appear at class time.',
      tag: 'routinesync-test',
      renotify: true,
      requireInteraction: false,
    });
    return true;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 RoutineSync Test',
      body: '✅ Notifications working! Schedule alerts will appear at class time.',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250],
      ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
    },
    trigger: null,
  });
  return true;
}
