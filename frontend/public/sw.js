/**
 * SmartFlow Service Worker
 * Intelligent multi-tier caching, stale-while-revalidate, and offline resilience.
 */

const CACHE_VERSION = 'smartflow-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CONTENT_CACHE = `${CACHE_VERSION}-content`;
const API_CACHE = `${CACHE_VERSION}-api`;
const MEDIA_CACHE = `${CACHE_VERSION}-media`;

const STATIC_ASSETS = [
  '/',
  '/offline',
  '/favicon.ico',
  '/globals.css',
];

// Maximum entries allowed in content and api caches
const MAX_API_ENTRIES = 50;
const MAX_CONTENT_ENTRIES = 30;

// Trim cache entries to prevent unbounded growth
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    await trimCache(cacheName, maxItems);
  }
}

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Pre-cache warning:', err))
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('smartflow-') && !name.startsWith(CACHE_VERSION))
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// ─── Fetch Interception ──────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Never cache authentication or admin mutation routes
  if (url.pathname.includes('/auth/') || url.pathname.includes('/admin/')) {
    return;
  }

  // 1. Static Assets: Cache-First
  if (
    url.pathname.match(/\.(css|js|woff2?|png|jpg|jpeg|svg|ico)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 2. Feed and Content API requests: Stale-While-Revalidate
  if (url.pathname.startsWith('/api/v1/feed') || url.pathname.startsWith('/api/v1/content')) {
    // Avoid caching large binary stream endpoints in API cache
    if (url.pathname.endsWith('/stream')) {
      return; // Video/audio streams handle byte-range requests directly
    }

    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);

        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
              trimCache(API_CACHE, MAX_API_ENTRIES);
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Navigation requests: Network-First with Offline Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('/offline');
      })
    );
    return;
  }
});
