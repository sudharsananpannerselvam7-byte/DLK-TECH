# SmartFlow Offline Resilience & Network Adaptation Engine

SmartFlow is engineered as a local-first, offline-resilient system designed to ensure uninterrupted content consumption during flaky or severed network connectivity.

---

## 1. Offline Mode Lifecycle

1. **State Detection:**
   The `useNetworkMonitor` hook in the browser and `NetworkProbe` in the desktop agent monitor physical network links and probe gateway RTT periodically.
2. **Graceful Fallback:**
   When `isOnline` becomes `false`:
   - Network prefetch requests are immediately paused to conserve system queues.
   - Resource lookups transparently check L1 (In-memory LRU) and L2 (Service Worker Cache Storage).
   - Local files continue to be served directly from disk.
   - An offline notification banner is displayed informing the user of cached resource availability.
3. **Network Recovery & Reconciliation:**
   When connectivity returns:
   - Pending background jobs in state `queued` are resumed.
   - Stale cache entries undergo conditional `ETag` / `If-Modified-Since` validation.
   - Prefetch queues refill adaptively based on current network bandwidth quality (`fast`, `medium`, `slow`).
