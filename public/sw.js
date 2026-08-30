// RoutineSync Service Worker v5
// Handles: Real Web Push, Periodic Background Sync, SW alarm store, notificationclick
const CACHE_VERSION = 'routinesync-sw-v5';
const DB_NAME = 'routinesync-db';
const DB_VERSION = 1;

// ─── LIFECYCLE ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
      .then(() => {
        // Register periodic background sync if available (Android Chrome PWA)
        if ('periodicSync' in self.registration) {
          return self.registration.periodicSync.register('check-schedule', {
            minInterval: 15 * 60 * 1000, // 15 minutes
          }).catch(() => {}); // graceful fail if permission denied
        }
      })
  );
});

// ─── INDEXEDDB HELPERS ────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('alarms')) {
        db.createObjectStore('alarms', { keyPath: 'tag' });
      }
      if (!db.objectStoreNames.contains('events')) {
        db.createObjectStore('events', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAlarmsFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('alarms', 'readonly');
      const req = tx.objectStore('alarms').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function saveAlarmsToDB(alarms) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('alarms', 'readwrite');
      const store = tx.objectStore('alarms');
      store.clear();
      for (const alarm of alarms) store.put(alarm);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {}
}

async function clearAlarmsFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('alarms', 'readwrite');
      tx.objectStore('alarms').clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {}
}

// ─── ALARM CHECKER ────────────────────────────────────────────────────────────
async function checkAndFireAlarms() {
  const now = Date.now();
  const alarms = await getAlarmsFromDB();
  const toFire = alarms.filter((a) => a.fireAt <= now);
  const remaining = alarms.filter((a) => a.fireAt > now);

  if (toFire.length === 0) return;

  // Save remaining alarms back
  await saveAlarmsToDB(remaining);

  for (const alarm of toFire) {
    try {
      await self.registration.showNotification(alarm.title, {
        // Chrome best practice: concise body ≤120 chars, title ≤50 chars
        body: (alarm.body || '').slice(0, 120),
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: alarm.tag,
        renotify: true,
        requireInteraction: alarm.requireInteraction || false,
        // Deep-link to app, not generic home screen
        data: { url: self.registration.scope },
        // Chrome best practice: up to 2 action buttons
        actions: [
          { action: 'open', title: '📅 View Schedule' },
          { action: 'dismiss', title: 'OK' },
        ],
      });
    } catch (err) {
      console.error('[SW] showNotification error:', err);
    }
  }
}

// ─── PERIODIC BACKGROUND SYNC ─────────────────────────────────────────────────
// Fires periodically on Android Chrome even when the app is not open
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-schedule') {
    event.waitUntil(checkAndFireAlarms());
  }
});

// ─── PAGE MESSAGE HANDLER ─────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type } = event.data;

  // Immediate notification (test button, live class alert)
  if (type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title.slice(0, 50), {
        body: (options.body || '').slice(0, 120),
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        tag: options.tag || 'routinesync-alert',
        renotify: options.renotify !== false,
        requireInteraction: options.requireInteraction || false,
        data: { url: self.registration.scope },
        actions: [
          { action: 'open', title: '📅 View Schedule' },
          { action: 'dismiss', title: 'OK' },
        ],
      })
    );
    return;
  }

  // Store upcoming alarms in IndexedDB (survives tab suspend)
  if (type === 'SCHEDULE_ALARM') {
    const { alarms } = event.data;
    if (Array.isArray(alarms)) {
      event.waitUntil(saveAlarmsToDB(alarms.filter((a) => a.fireAt > Date.now())));
    }
    return;
  }

  // Clear all stored alarms
  if (type === 'CANCEL_ALARMS') {
    event.waitUntil(clearAlarmsFromDB());
    return;
  }

  // Heartbeat tick — check alarms immediately
  if (type === 'TICK') {
    event.waitUntil(checkAndFireAlarms());
    return;
  }
});

// ─── SERVER WEB PUSH ──────────────────────────────────────────────────────────
// Receives real push from Vercel cron (works even when app is CLOSED)
self.addEventListener('push', (event) => {
  let data = { title: 'RoutineSync', body: 'You have an upcoming class!' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification((data.title || 'RoutineSync').slice(0, 50), {
      body: (data.body || '').slice(0, 120),
      icon: data.icon || '/icon.png',
      badge: data.badge || '/icon.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'routinesync-push',
      renotify: true,
      // Deep-link to the schedule view
      data: { url: data.url || self.registration.scope },
      actions: [
        { action: 'open', title: '📅 View Schedule' },
        { action: 'dismiss', title: 'OK' },
      ],
    })
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
// Chrome best practice: focus existing window, not open duplicate
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus the existing PWA window if it's open
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open the PWA
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('notificationclose', () => {});
