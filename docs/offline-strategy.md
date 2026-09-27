# SmartFlow Offline Strategy & Resilience

## 1. Resilience Philosophy

SmartFlow does not make unrealistic claims of "unlimited offline storage". Instead:
- **Offline access is strictly limited** to content previously buffered or permitted for local client persistence.
- When network disconnects, the system switches to **Local Resilience Mode**.
- Active network requests are cleanly suspended with timeout backoff to avoid draining device battery.

---

## 2. Transition Protocol

### Disconnection Sequence:
1. `window.addEventListener('offline')` triggers Network Monitor state transition.
2. The UI switches the status indicator to `OFFLINE / LOCAL CACHE`.
3. Background prefetch jobs pause and release network slots.
4. Navigation and feed queries fall back to Service Worker `CacheStorage` and `localStorage` snapshot.

### Reconnection Sequence:
1. `window.addEventListener('online')` triggers network recovery.
2. Ping probe verifies actual internet connectivity to `/api/v1/health`.
3. Status changes to `SYNCING...`.
4. **Stale Cache Revalidation**: Background HTTP requests revalidate cached items using `ETag` and `If-None-Match`.
5. **Prefetch Refill**: Missing items are fetched and the prefetch queue resumes.
6. Status returns to `ONLINE`.
