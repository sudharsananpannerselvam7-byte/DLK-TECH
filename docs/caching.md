# SmartFlow Multi-Tier Caching Architecture

## Overview

SmartFlow implements a multi-tier caching hierarchy to deliver predictable sub-20ms metadata responses and immediate client-side availability for prefetched assets.

---

## 1. Caching Tiers

```
[ Tier 1: Client In-Memory (LRU) ]   → Latency: < 2ms
               ↓ (cache miss)
[ Tier 2: Service Worker (CacheStorage) ] → Latency: < 5ms (Offline Resilient)
               ↓ (cache miss)
[ Tier 3: Edge Redis Cache (Distributed) ] → Latency: < 15ms (Coalescing Lock)
               ↓ (cache miss)
[ Tier 4: PostgreSQL + Disk Origin ]     → Latency: 50 - 150ms
```

---

## 2. Strategies by Resource Type

### 2.1 Static Immutable Assets (`.js`, `.css`, fonts, icons)
- **Strategy**: `CACHE-FIRST`
- **Cache-Control**: `public, max-age=31536000, immutable`
- Intercepted by Service Worker and served directly from disk/memory cache.

### 2.2 Feed Items and Metadata
- **Strategy**: `STALE-WHILE-REVALIDATE`
- **Cache-Control**: `public, max-age=60, stale-while-revalidate=300`
- Instant UI render with cached version while background worker silently queries for delta updates.

### 2.3 Critical Fresh Data (User Auth, Session State, Real-Time Job Progress)
- **Strategy**: `NETWORK-FIRST WITH CACHE FALLBACK`
- Ensures security policies, revocations, and transaction states are strictly authoritative.

### 2.4 Offline-Capable Media & Previously Viewed Content
- **Strategy**: `CACHE-FIRST WITH NETWORK FALLBACK`
- Served seamlessly during offline/tunnel dropouts from Service Worker `CacheStorage`.

---

## 3. Cache Stampede Protection (Request Coalescing)

When 1,000 users concurrently request the same newly published or expired media item:
1. The first incoming request acquires a temporary Redis mutex lock (`lock:content:{id}`).
2. Subsequent requests wait on Redis pub/sub or poll the key with exponential backoff.
3. Origin query executes exactly **once**.
4. The resolved content is written to Redis with TTL, releasing all waiting client requests simultaneously.
5. Protects origin database from CPU/connection pool collapse.

---

## 4. Cache Invalidation & Versioning

- Global version tag `CACHE_VERSION = 'smartflow-v1'`.
- Granular invalidation endpoint `POST /api/v1/cache/invalidate/{id}` purges:
  - Redis key `sf:cache:content:{id}`
  - Client memory cache entry
  - Associated prefetch status keys
- Cache pre-warming via `POST /api/v1/cache/warm/{id}` populates hot L3 cache ahead of peak user demand.
