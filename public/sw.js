// RoutineSync Service Worker v3 — PWA Mobile Class Schedule Notifications
const CACHE_VERSION = 'routinesync-sw-v3';

// Force immediate activation on install — skip waiting for old SW
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// Claim all open tabs immediately so new SW takes effect right away
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── NOTIFICATION TRIGGER LISTENER ────────────────────────────────────────────
// Called from triggerWebNotification() in notifier.ts via postMessage
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;

  const { title, options } = event.data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: options.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: options.tag || 'routinesync-schedule-alert',
      renotify: true,
      requireInteraction: options.requireInteraction || false,
      data: { url: options.dataUrl || '/' },
      actions: [
        { action: 'open', title: '📅 Open RoutineSync' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
    })
  );
});

// ─── SERVER PUSH NOTIFICATION LISTENER ────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'RoutineSync Alert', body: 'You have an upcoming class scheduled!' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || 'Upcoming class schedule alert.',
      icon: '/icon.png',
      badge: '/icon.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'routinesync-push-notification',
      renotify: true,
      data: { url: '/' },
      actions: [
        { action: 'open', title: '📅 Open RoutineSync' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
    })
  );
});

// ─── NOTIFICATION CLICK HANDLER ───────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing PWA window if open
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// ─── NOTIFICATION CLOSE HANDLER ───────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  // Cleanup — nothing critical needed here
});
