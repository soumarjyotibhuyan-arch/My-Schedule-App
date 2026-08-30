// RoutineSync Service Worker v4 — PWA Mobile Class Schedule Notifications
// This SW handles: scheduled alarm messages from the app, push events, and notification clicks.

const CACHE_VERSION = 'routinesync-sw-v4';

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Immediately take over — do not wait for old SW to finish
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// ─── ALARM STORE ──────────────────────────────────────────────────────────────
// Store pending alarms in SW scope so they survive tab close (up to ~minutes, not hours)
let pendingAlarms = [];

// ─── PERIODIC ALARM CHECK ────────────────────────────────────────────────────
// Called via SW message every 30s from the app page AND by a SW-internal interval
let alarmInterval = null;

function startAlarmInterval() {
  if (alarmInterval) return;
  alarmInterval = setInterval(() => {
    checkAndFireAlarms();
  }, 30000);
}

function checkAndFireAlarms() {
  const now = Date.now();
  const toFire = pendingAlarms.filter(a => a.fireAt <= now);
  pendingAlarms = pendingAlarms.filter(a => a.fireAt > now);

  for (const alarm of toFire) {
    self.registration.showNotification(alarm.title, {
      body: alarm.body,
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: alarm.tag || 'routinesync-alarm',
      renotify: true,
      requireInteraction: alarm.requireInteraction || false,
      data: { url: self.registration.scope },
      actions: [
        { action: 'open', title: '📅 Open RoutineSync' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
    }).catch(() => {});
  }
}

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;

  const { type } = event.data;

  // Immediate notification (test button, live class alert)
  if (type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        body: options.body || '',
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        tag: options.tag || 'routinesync-alert',
        renotify: options.renotify !== false,
        requireInteraction: options.requireInteraction || false,
        data: { url: self.registration.scope },
        actions: [
          { action: 'open', title: '📅 Open RoutineSync' },
          { action: 'dismiss', title: 'Dismiss' }
        ],
      })
    );
    return;
  }

  // Schedule a future alarm (persisted in SW memory for ~minutes)
  if (type === 'SCHEDULE_ALARM') {
    const { alarms } = event.data; // array of { fireAt, title, body, tag, requireInteraction }
    if (Array.isArray(alarms)) {
      // Replace all pending alarms with the new set
      pendingAlarms = alarms.filter(a => a.fireAt > Date.now());
    }
    startAlarmInterval();
    return;
  }

  // Cancel all scheduled alarms
  if (type === 'CANCEL_ALARMS') {
    pendingAlarms = [];
    return;
  }

  // Heartbeat tick from the page — check alarms immediately
  if (type === 'TICK') {
    checkAndFireAlarms();
    return;
  }
});

// ─── SERVER PUSH ──────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'RoutineSync', body: 'You have an upcoming class!' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200],
      tag: 'routinesync-push',
      renotify: true,
      data: { url: self.registration.scope },
      actions: [
        { action: 'open', title: '📅 Open RoutineSync' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
    })
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('notificationclose', () => {});
