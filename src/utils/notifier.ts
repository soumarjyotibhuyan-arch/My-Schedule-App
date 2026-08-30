import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ScheduleEvent } from '../types';

// ─── NATIVE NOTIFICATION HANDLER ─────────────────────────────────────────────
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

// ─── VAPID PUBLIC KEY ─────────────────────────────────────────────────────────
// This key allows the browser to verify push messages came from our server
const VAPID_PUBLIC_KEY = 'BKper_4FWbjBdzBkxrRjAZA8QPQHhE0QFAnBiGOY-qnD68CX6PDVxD5yxGqOVxqmEeMh2eiu9FpfOb1Xle7ni98';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let lastNotifiedEventId: string | null = null;
let pushSubscription: PushSubscription | null = null;

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) return false;
      if (window.Notification.permission === 'granted') return true;
      if (window.Notification.permission === 'denied') return false;
      const status = await window.Notification.requestPermission().catch(() => 'default');
      return status === 'granted';
    } catch {
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

// ─── WEB PUSH SUBSCRIPTION ───────────────────────────────────────────────────
/**
 * Subscribe to Web Push via VAPID.
 * Returns the PushSubscription or null if unavailable/denied.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) return null;

    // Check existing subscription first
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      pushSubscription = existing;
      return existing;
    }

    // Create new subscription
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, // Chrome requires this to be true
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });

    pushSubscription = sub;
    return sub;
  } catch (err) {
    console.warn('[Push] Subscribe error:', err);
    return null;
  }
}

/**
 * Save the push subscription + events to Vercel so the cron job can send pushes
 * even when the app is completely closed.
 */
export async function savePushSubscriptionToServer(
  sub: PushSubscription,
  events: ScheduleEvent[]
): Promise<boolean> {
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          time: e.time,
          date: e.date,
          dayOfWeek: e.dayOfWeek,
          venue: e.venue,
          reminderMinutesBefore: e.reminderMinutesBefore || 5,
        })),
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[Push] Save subscription error:', err);
    return false;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getFormattedEndTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  const total = h * 60 + m + 90;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
async function postToSW(message: object): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const target = navigator.serviceWorker.controller || reg.active || reg.waiting;
    if (!target) return false;
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

async function showNotificationViaSW(title: string, options: {
  body: string; tag: string; requireInteraction?: boolean; renotify?: boolean;
}): Promise<void> {
  const sent = await postToSW({ type: 'SHOW_NOTIFICATION', title, options });
  // Desktop fallback (not mobile Chrome)
  if (!sent && typeof window !== 'undefined' && 'Notification' in window &&
      window.Notification.permission === 'granted') {
    try {
      new (window as any).Notification(title, {
        body: options.body, icon: '/icon.png', badge: '/icon.png', tag: options.tag,
      });
    } catch {}
  }
}

export async function tickSWAlarmCheck(): Promise<void> {
  if (Platform.OS !== 'web') return;
  await postToSW({ type: 'TICK' });
}

// ─── CANCEL ALL ───────────────────────────────────────────────────────────────
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    await postToSW({ type: 'CANCEL_ALARMS' });
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

    const endDateObj = new Date(startDateObj.getTime() + 90 * 60000);
    const endTimeDisplay = event.rawTime || getFormattedEndTime(event.time);

    // Native (Android/iOS) — expo-notifications handles everything
    if (Platform.OS !== 'web') {
      const base = {
        sound: 'default', priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
      };
      const reminderMs = startDateObj.getTime() - (event.reminderMinutesBefore || 5) * 60000;
      if (reminderMs > Date.now()) {
        ids.push(await Notifications.scheduleNotificationAsync({
          content: { ...base, title: `⏰ Class in ${event.reminderMinutesBefore}m: ${event.title}`, body: `${event.title} at ${event.time}${event.venue ? ` · ${event.venue}` : ''}` },
          trigger: { date: reminderMs, ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}) } as any,
        }));
      }
      if (startDateObj.getTime() > Date.now()) {
        ids.push(await Notifications.scheduleNotificationAsync({
          content: { ...base, title: `🟢 Class starting: ${event.title}`, body: `Starting now${event.venue ? ` at ${event.venue}` : ''} until ${endTimeDisplay}.` },
          trigger: { date: startDateObj.getTime(), ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}) } as any,
        }));
      }
      return ids;
    }

    // Web / PWA — return serialized alarm descriptors (batched in scheduleAllEvents)
    const nowMs = Date.now();
    const reminderMs = startDateObj.getTime() - (event.reminderMinutesBefore || 5) * 60000;

    if (reminderMs > nowMs) {
      ids.push(JSON.stringify({
        fireAt: reminderMs,
        title: `⏰ Class in ${event.reminderMinutesBefore || 5}m: ${event.title}`,
        body: `${event.title} at ${event.time}${event.venue ? ` · ${event.venue}` : ''}`.slice(0, 120),
        tag: `reminder-${event.id || event.title}`,
        requireInteraction: false,
      }));
    }
    if (startDateObj.getTime() > nowMs) {
      ids.push(JSON.stringify({
        fireAt: startDateObj.getTime(),
        title: `🟢 Class starting: ${event.title}`,
        body: `Starting now${event.venue ? ` at ${event.venue}` : ''} until ${endTimeDisplay}.`.slice(0, 120),
        tag: `start-${event.id || event.title}`,
        requireInteraction: true,
      }));
    }
    if (endDateObj.getTime() > nowMs) {
      ids.push(JSON.stringify({
        fireAt: endDateObj.getTime(),
        title: `🏁 Class done: ${event.title}`,
        body: `${event.title} has finished.`,
        tag: `end-${event.id || event.title}`,
        requireInteraction: false,
      }));
    }
  } catch (err) {
    console.error('[notifier] scheduleEventNotification error:', err);
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

  // Web: collect alarm descriptors → send as one batch to SW IndexedDB
  const alarms: any[] = [];
  for (const event of events) {
    const ids = await scheduleEventNotification(event);
    for (const idJson of ids) {
      try { alarms.push(JSON.parse(idJson)); } catch {}
    }
  }

  if (alarms.length > 0) {
    await postToSW({ type: 'SCHEDULE_ALARM', alarms });
  }

  // Also save to server for cron-push (background push when app is closed)
  try {
    const sub = await subscribeToPush();
    if (sub) {
      await savePushSubscriptionToServer(sub, events);
    }
  } catch (err) {
    console.warn('[Push] Could not save subscription to server:', err);
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

  // Heartbeat tick → SW checks IndexedDB alarms immediately
  tickSWAlarmCheck();

  if (ongoingEvent) {
    const key = `ongoing-${ongoingEvent.id || ongoingEvent.title}-${ongoingEvent.time}`;
    if (lastNotifiedEventId !== key) {
      lastNotifiedEventId = key;
      const timeRange = ongoingEvent.rawTime ||
        `${ongoingEvent.time} – ${getFormattedEndTime(ongoingEvent.time)}`;
      showNotificationViaSW(`🟢 LIVE: ${ongoingEvent.title}`, {
        body: `${timeRange}${ongoingEvent.venue ? ` · ${ongoingEvent.venue}` : ''}`.slice(0, 120),
        tag: 'schedule-sync-live',
        renotify: true,
        requireInteraction: true,
      });
    }
  } else if (nextUpEvent) {
    const key = `next-${nextUpEvent.id || nextUpEvent.title}-${nextUpEvent.time}`;
    if (lastNotifiedEventId !== key && lastNotifiedEventId?.startsWith('ongoing-')) {
      lastNotifiedEventId = key;
      showNotificationViaSW(`⚡ NEXT: ${nextUpEvent.title}`, {
        body: `Starts at ${nextUpEvent.time}${nextUpEvent.venue ? ` · ${nextUpEvent.venue}` : ''}`.slice(0, 120),
        tag: 'schedule-sync-next',
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
    // Also try to subscribe to Web Push at this point (contextual — user just granted permission)
    try {
      const sub = await subscribeToPush();
      if (sub) {
        console.log('[Push] Subscribed to Web Push successfully');
        // Save subscription to server immediately (events will be saved on next scheduleAllEvents)
        await savePushSubscriptionToServer(sub, []);
      }
    } catch {}

    await showNotificationViaSW('🔔 RoutineSync Test', {
      body: '✅ Notifications working! Class alerts will appear even when the app is in the background.',
      tag: 'routinesync-test',
      renotify: true,
      requireInteraction: false,
    });
    return true;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 RoutineSync Test',
      body: '✅ Notifications working! Class alerts will appear at class time.',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 250, 250, 250],
      ...(Platform.OS === 'android' ? { channelId: 'schedule-alerts' } : {}),
    },
    trigger: null,
  });
  return true;
}
