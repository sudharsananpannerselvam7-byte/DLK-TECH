/**
 * SmartFlow Smart Delivery Engine
 * Client-side intelligent caching, prefetching, and network-aware delivery.
 */
'use client';

import { type ContentItem, contentApi, prefetchApi } from '@/lib/api/client';

export type NetworkQuality = 'fast' | 'medium' | 'slow' | 'offline';
export type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'cache-with-fallback';

const CACHE_VERSION = 'sf-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const CONTENT_CACHE = `${CACHE_VERSION}-content`;
const API_CACHE = `${CACHE_VERSION}-api`;
const MAX_API_CACHE_SIZE = 100;
const MAX_CONTENT_CACHE_SIZE = 50;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  strategy: CacheStrategy;
}

class InMemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number, strategy: CacheStrategy = 'cache-first'): void {
    if (this.store.size >= this.maxSize) {
      // Evict oldest entry (LRU-lite)
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { data, timestamp: Date.now(), ttl, strategy });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  isStale(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    const halfLife = entry.ttl * 500; // Half TTL
    return Date.now() > entry.timestamp + halfLife;
  }

  getMetrics() {
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      keys: Array.from(this.store.keys()).slice(0, 10),
    };
  }
}

class PrefetchQueue {
  private queue: Set<string> = new Set();
  private inFlight: Set<string> = new Set();
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(contentId: string): void {
    if (!this.inFlight.has(contentId) && !this.queue.has(contentId)) {
      this.queue.add(contentId);
    }
  }

  dequeue(networkQuality: NetworkQuality): string[] {
    if (networkQuality === 'offline') return [];
    const limit = networkQuality === 'fast' ? this.maxConcurrent : networkQuality === 'medium' ? 2 : 1;
    
    const available = limit - this.inFlight.size;
    if (available <= 0) return [];

    const items = Array.from(this.queue).slice(0, available);
    items.forEach(id => {
      this.queue.delete(id);
      this.inFlight.add(id);
    });
    return items;
  }

  complete(contentId: string): void {
    this.inFlight.delete(contentId);
  }

  cancel(contentIds: string[]): void {
    contentIds.forEach(id => {
      this.queue.delete(id);
      this.inFlight.delete(id);
    });
  }

  clear(): void {
    this.queue.clear();
  }

  getStatus() {
    return {
      queued: this.queue.size,
      inFlight: this.inFlight.size,
    };
  }
}

export class SmartDeliveryEngine {
  private apiCache = new InMemoryCache(MAX_API_CACHE_SIZE);
  private contentCache = new InMemoryCache(MAX_CONTENT_CACHE_SIZE);
  private prefetchQueue = new PrefetchQueue(3);
  private networkQuality: NetworkQuality = 'medium';
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    prefetchHits: 0,
    networkErrors: 0,
    totalRequests: 0,
  };

  setNetworkQuality(quality: NetworkQuality): void {
    this.networkQuality = quality;
    if (quality === 'offline') {
      this.prefetchQueue.clear();
    }
  }

  /**
   * Fetch content with intelligent caching strategy.
   * Returns immediately if cached, fetches from network otherwise.
   */
  async getContent(contentId: string): Promise<ContentItem | null> {
    this.metrics.totalRequests++;
    const cacheKey = `content:${contentId}`;
    
    // Cache-first strategy for content metadata
    const cached = this.contentCache.get<ContentItem>(cacheKey);
    if (cached) {
      this.metrics.cacheHits++;
      
      // Stale-while-revalidate: return cache, refresh in background if stale
      if (this.contentCache.isStale(cacheKey) && this.networkQuality !== 'offline') {
        this.refreshContentInBackground(contentId, cacheKey);
      }
      
      return cached;
    }

    this.metrics.cacheMisses++;
    
    if (this.networkQuality === 'offline') {
      return null; // Cannot fetch, no cache
    }

    try {
      const response = await contentApi.get(contentId);
      const content = response.data as ContentItem;
      this.contentCache.set(cacheKey, content, 300, 'stale-while-revalidate');
      return content;
    } catch {
      this.metrics.networkErrors++;
      return null;
    }
  }

  private async refreshContentInBackground(contentId: string, cacheKey: string): Promise<void> {
    try {
      const response = await contentApi.get(contentId);
      this.contentCache.set(cacheKey, response.data as ContentItem, 300, 'stale-while-revalidate');
    } catch {
      // Silent background refresh failure is ok
    }
  }

  /**
   * Schedule prefetching for likely-next content items.
   */
  schedulePrefetch(contentIds: string[]): void {
    if (this.networkQuality === 'offline') return;
    
    // Filter IDs not already cached
    const uncached = contentIds.filter(id => !this.contentCache.get(`content:${id}`));
    uncached.forEach(id => this.prefetchQueue.enqueue(id));
    
    this.processPrefetchQueue();
  }

  private async processPrefetchQueue(): Promise<void> {
    const toFetch = this.prefetchQueue.dequeue(this.networkQuality);
    
    await Promise.allSettled(
      toFetch.map(async (contentId) => {
        try {
          const response = await contentApi.get(contentId);
          const cacheKey = `content:${contentId}`;
          this.contentCache.set(cacheKey, response.data as ContentItem, 300, 'cache-first');
          
          // Also notify backend about successful prefetch
          await prefetchApi.request([contentId], this.networkQuality);
        } catch {
          // Prefetch failures are silent
        } finally {
          this.prefetchQueue.complete(contentId);
        }
      })
    );
  }

  /**
   * Cancel prefetch for content IDs that are no longer relevant.
   */
  cancelPrefetch(contentIds: string[]): void {
    this.prefetchQueue.cancel(contentIds);
  }

  /**
   * Check if a content item is already prefetched/cached.
   */
  isPrefetched(contentId: string): boolean {
    return !!this.contentCache.get(`content:${contentId}`);
  }

  /**
   * Get performance metrics.
   */
  getMetrics() {
    const total = this.metrics.totalRequests;
    return {
      ...this.metrics,
      hitRate: total > 0 ? Math.round(this.metrics.cacheHits / total * 100) : 0,
      prefetchHitRate: total > 0 ? Math.round(this.metrics.prefetchHits / total * 100) : 0,
      cache: this.contentCache.getMetrics(),
      prefetchQueue: this.prefetchQueue.getStatus(),
      networkQuality: this.networkQuality,
    };
  }

  /**
   * Convenience alias to fetch content item.
   */
  async get(contentId: string): Promise<ContentItem | null> {
    return this.getContent(contentId);
  }

  /**
   * Invalidate cache for a content item (e.g., after update).
   */
  invalidate(contentId: string): void {
    this.contentCache.invalidate(`content:${contentId}`);
  }

  /**
   * Clear all caches.
   */
  clearAll(): void {
    this.apiCache.invalidatePattern('');
    this.contentCache.invalidatePattern('');
  }

  /**
   * Alias for clearAll.
   */
  clearCache(): void {
    this.clearAll();
  }

  /**
   * Get telemetry stats.
   */
  getStats() {
    return {
      memoryCacheItems: this.contentCache.getMetrics().size,
      pendingPrefetches: this.prefetchQueue.getStatus().queued,
    };
  }

  /**
   * Enqueue items for predictive prefetching.
   */
  async triggerPrefetch(contentIds: string[], quality?: NetworkQuality): Promise<void> {
    if (quality) this.setNetworkQuality(quality);
    this.schedulePrefetch(contentIds);
  }
}

// Singleton instance
let engineInstance: SmartDeliveryEngine | null = null;

export function getDeliveryEngine(): SmartDeliveryEngine {
  if (!engineInstance) {
    engineInstance = new SmartDeliveryEngine();
  }
  return engineInstance;
}
