/**
 * Service Worker for QR Order Pager Customer Tracker PWA.
 * - Precaches shell assets.
 * - Serves cached assets offline.
 * - Handles push events from Web Push API.
 */
const CACHE_NAME = 'qr-order-tracker-v1';
const ASSETS = [
  '/',
  '/track',
  '/manifest.json',
];

// Install: precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch((err) => {
      console.error('[SW] install cache failed', err);
    }),
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
    }).then(() => self.clients.claim()),
  );
});

// Fetch: cache-first for shell, network-first for API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: only intercept same-origin API routes; let cross-origin
  // API calls (e.g. to backend on a different port) go directly to the browser
  // so CORS is handled normally.
  if (url.pathname.startsWith('/api/') && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request)),
    );
    return;
  }

  // Shell assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    }),
  );
});

// Push: show notification when a push arrives
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'QR Order Pager';
  const options = {
    body: data.body || data.message || 'Your order status has changed.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.orderId || 'qr-order',
    data: {
      url: data.url || '/',
      orderId: data.orderId,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: open tracker
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
