"""
SmartFlow Redis Cache Manager
Handles connection pooling, key management, cache-stampede protection,
and multiple cache strategies with fakeredis fallback for development.
"""
import json
import hashlib
import threading
import time
from contextlib import contextmanager
from datetime import timedelta
from typing import Any, Callable, Optional, Union
from functools import wraps

import structlog

logger = structlog.get_logger(__name__)


class CacheManager:
    """
    Unified Redis cache manager with:
    - Multiple cache strategies (Cache-First, Network-First, SWR, Cache-with-Fallback)
    - Cache stampede protection via distributed locking
    - Key versioning and namespace isolation
    - TTL management
    - Metrics tracking
    """

    CACHE_VERSION = "v1"
    DEFAULT_TTL = 300
    LOCK_TTL = 30
    LOCK_RETRY_INTERVAL = 0.05
    LOCK_MAX_RETRIES = 100

    def __init__(self, redis_client=None, fake: bool = False):
        self._redis = redis_client
        self._fake = fake
        self._local_cache: dict = {}  # Fallback in-memory if redis unavailable
        self._lock_map: dict = {}  # threading.Lock per key for in-memory stampede protection
        self._metrics = {"hits": 0, "misses": 0, "sets": 0, "deletes": 0, "errors": 0}

    def _make_key(self, namespace: str, key: str) -> str:
        """Create a versioned, namespaced cache key."""
        return f"sf:{self.CACHE_VERSION}:{namespace}:{key}"

    def _serialize(self, value: Any) -> str:
        return json.dumps(value, default=str)

    def _deserialize(self, raw: Optional[str]) -> Optional[Any]:
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    def get(self, namespace: str, key: str) -> Optional[Any]:
        """Get a value from cache. Returns None on miss."""
        cache_key = self._make_key(namespace, key)
        try:
            if self._redis:
                raw = self._redis.get(cache_key)
                if raw is not None:
                    self._metrics["hits"] += 1
                    logger.debug("cache_hit", key=cache_key)
                    return self._deserialize(raw)
            else:
                entry = self._local_cache.get(cache_key)
                if entry and (entry["expires_at"] is None or entry["expires_at"] > time.time()):
                    self._metrics["hits"] += 1
                    return entry["value"]
            self._metrics["misses"] += 1
            logger.debug("cache_miss", key=cache_key)
            return None
        except Exception as e:
            self._metrics["errors"] += 1
            logger.warning("cache_get_error", key=cache_key, error=str(e))
            return None

    def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set a cache value with optional TTL."""
        cache_key = self._make_key(namespace, key)
        ttl = ttl or self.DEFAULT_TTL
        try:
            if self._redis:
                self._redis.setex(cache_key, ttl, self._serialize(value))
            else:
                self._local_cache[cache_key] = {
                    "value": value,
                    "expires_at": time.time() + ttl if ttl else None,
                }
            self._metrics["sets"] += 1
            return True
        except Exception as e:
            self._metrics["errors"] += 1
            logger.warning("cache_set_error", key=cache_key, error=str(e))
            return False

    def delete(self, namespace: str, key: str) -> bool:
        """Delete a cache entry."""
        cache_key = self._make_key(namespace, key)
        try:
            if self._redis:
                self._redis.delete(cache_key)
            else:
                self._local_cache.pop(cache_key, None)
            self._metrics["deletes"] += 1
            return True
        except Exception as e:
            self._metrics["errors"] += 1
            logger.warning("cache_delete_error", key=cache_key, error=str(e))
            return False

    def delete_namespace(self, namespace: str) -> int:
        """Delete all keys in a namespace (cache invalidation)."""
        pattern = self._make_key(namespace, "*")
        deleted = 0
        try:
            if self._redis:
                keys = self._redis.keys(pattern)
                if keys:
                    deleted = self._redis.delete(*keys)
            else:
                to_delete = [k for k in self._local_cache if k.startswith(f"sf:{self.CACHE_VERSION}:{namespace}:")]
                for k in to_delete:
                    del self._local_cache[k]
                deleted = len(to_delete)
            logger.info("cache_namespace_deleted", namespace=namespace, count=deleted)
            return deleted
        except Exception as e:
            logger.warning("cache_namespace_delete_error", namespace=namespace, error=str(e))
            return 0

    @contextmanager
    def _distributed_lock(self, lock_key: str):
        """Distributed lock for cache-stampede protection."""
        acquired = False
        lock_value = str(threading.get_ident())
        try:
            if self._redis:
                for _ in range(self.LOCK_MAX_RETRIES):
                    result = self._redis.set(
                        f"sf:lock:{lock_key}", lock_value,
                        nx=True, ex=self.LOCK_TTL
                    )
                    if result:
                        acquired = True
                        break
                    time.sleep(self.LOCK_RETRY_INTERVAL)
            else:
                # In-memory lock
                if lock_key not in self._lock_map:
                    self._lock_map[lock_key] = threading.Lock()
                acquired = self._lock_map[lock_key].acquire(timeout=self.LOCK_TTL)
            yield acquired
        finally:
            if acquired:
                if self._redis:
                    # Only delete if we own the lock
                    pipe = self._redis.pipeline(True)
                    try:
                        pipe.watch(f"sf:lock:{lock_key}")
                        current = self._redis.get(f"sf:lock:{lock_key}")
                        if current and current.decode() == lock_value:
                            pipe.multi()
                            pipe.delete(f"sf:lock:{lock_key}")
                            pipe.execute()
                    except Exception:
                        pass
                elif lock_key in self._lock_map:
                    try:
                        self._lock_map[lock_key].release()
                    except RuntimeError:
                        pass

    def get_or_set(
        self,
        namespace: str,
        key: str,
        fetcher: Callable,
        ttl: Optional[int] = None,
        strategy: str = "cache-first"
    ) -> Any:
        """
        Cache-aware fetcher with stampede protection.
        Strategies:
          - cache-first: return cache if available, else fetch and cache
          - network-first: fetch fresh, fallback to cache on error
          - stale-while-revalidate: return stale cache, refresh in background
        """
        cached = self.get(namespace, key)

        if strategy == "cache-first":
            if cached is not None:
                return cached
            with self._distributed_lock(f"{namespace}:{key}"):
                # Double-check after lock
                cached = self.get(namespace, key)
                if cached is not None:
                    return cached
                value = fetcher()
                if value is not None:
                    self.set(namespace, key, value, ttl)
                return value

        elif strategy == "network-first":
            try:
                value = fetcher()
                if value is not None:
                    self.set(namespace, key, value, ttl)
                return value
            except Exception as e:
                logger.warning("network_first_fallback", error=str(e))
                return cached

        elif strategy == "stale-while-revalidate":
            if cached is not None:
                # Return stale, refresh async (caller handles threading)
                return cached, True  # (value, is_stale)
            value = fetcher()
            if value is not None:
                self.set(namespace, key, value, ttl)
            return value, False

        return fetcher()

    def get_metrics(self) -> dict:
        """Return cache performance metrics."""
        total = self._metrics["hits"] + self._metrics["misses"]
        hit_rate = (self._metrics["hits"] / total * 100) if total > 0 else 0.0
        return {
            **self._metrics,
            "total_requests": total,
            "hit_rate_percent": round(hit_rate, 2),
        }

    def invalidate_content(self, content_id: str):
        """Invalidate all cache entries related to a content item."""
        self.delete("content", content_id)
        self.delete("content_meta", content_id)
        self.delete("content_stream", content_id)
        self.delete_namespace(f"feed")
        logger.info("cache_invalidated", content_id=content_id)

    def health_check(self) -> dict:
        """Check Redis connectivity."""
        if self._redis:
            try:
                self._redis.ping()
                return {"status": "ok", "backend": "redis"}
            except Exception as e:
                return {"status": "error", "backend": "redis", "error": str(e)}
        return {"status": "ok", "backend": "in-memory (dev)"}


# Singleton accessor - initialized in app factory
_cache_manager: Optional[CacheManager] = None


def get_cache() -> CacheManager:
    """Get the global CacheManager instance."""
    global _cache_manager
    if _cache_manager is None:
        raise RuntimeError("CacheManager not initialized. Call init_cache() first.")
    return _cache_manager


def init_cache(app) -> CacheManager:
    """Initialize the cache manager from app config."""
    global _cache_manager
    use_fake = app.config.get("USE_FAKE_REDIS", True)
    redis_url = app.config.get("REDIS_URL", "redis://localhost:6379/0")

    redis_client = None
    if not use_fake:
        try:
            import redis
            pool = redis.ConnectionPool.from_url(redis_url, decode_responses=True, max_connections=20)
            redis_client = redis.Redis(connection_pool=pool)
            redis_client.ping()
            logger.info("cache_redis_connected", url=redis_url.split("@")[-1])
        except Exception as e:
            logger.warning("cache_redis_failed", error=str(e), fallback="fakeredis")
            use_fake = True

    if use_fake:
        try:
            import fakeredis
            redis_client = fakeredis.FakeRedis(decode_responses=True)
            logger.info("cache_using_fakeredis")
        except ImportError:
            logger.warning("fakeredis_not_available", fallback="in-memory")
            redis_client = None

    _cache_manager = CacheManager(redis_client=redis_client, fake=use_fake)
    return _cache_manager


def cache_key_for(namespace: str, *args) -> str:
    """Generate a deterministic cache key from multiple arguments."""
    raw = ":".join(str(a) for a in args)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def cached(namespace: str, ttl: int = 300, strategy: str = "cache-first"):
    """Decorator to cache function return values."""
    def decorator(fn: Callable):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key = cache_key_for(namespace, fn.__name__, *args, *sorted(kwargs.items()))
            return get_cache().get_or_set(
                namespace=namespace,
                key=key,
                fetcher=lambda: fn(*args, **kwargs),
                ttl=ttl,
                strategy=strategy,
            )
        return wrapper
    return decorator
