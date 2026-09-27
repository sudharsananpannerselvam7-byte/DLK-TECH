"""
SmartFlow Latency Monitoring
Records request latency to the database for analytics.
Uses a background thread queue to avoid blocking requests.
"""
import queue
import threading
import time
import structlog
from typing import Optional

logger = structlog.get_logger(__name__)

_metric_queue: queue.Queue = queue.Queue(maxsize=10000)
_worker_started = False
_worker_lock = threading.Lock()


def _start_worker():
    """Start the background metric-writing worker."""
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        _worker_started = True

    def worker():
        from app.extensions import db
        from app.models import LatencyMetric
        from flask import current_app

        with current_app.app_context():
            while True:
                try:
                    batch = []
                    try:
                        # Collect up to 50 metrics at a time
                        for _ in range(50):
                            try:
                                item = _metric_queue.get_nowait()
                                batch.append(item)
                            except queue.Empty:
                                break
                    except Exception:
                        pass

                    if batch:
                        try:
                            db.session.bulk_insert_mappings(LatencyMetric, batch)
                            db.session.commit()
                        except Exception as e:
                            db.session.rollback()
                            logger.warning("latency_batch_write_failed", error=str(e))
                    else:
                        time.sleep(1)
                except Exception as e:
                    logger.warning("latency_worker_error", error=str(e))
                    time.sleep(5)

    t = threading.Thread(target=worker, daemon=True, name="latency-writer")
    t.start()


def record_latency(
    endpoint: str,
    method: str,
    status_code: int,
    latency_ms: float,
    request_id: Optional[str] = None,
    cache_result: Optional[str] = None,
    user_id: Optional[str] = None,
    content_id: Optional[str] = None,
    backend_ms: Optional[float] = None,
    db_ms: Optional[float] = None,
    network_quality: Optional[str] = None,
):
    """Queue a latency metric for background writing."""
    from datetime import datetime, timezone
    import uuid

    metric = {
        "id": str(uuid.uuid4()),
        "recorded_at": datetime.now(timezone.utc),
        "endpoint": endpoint[:255] if endpoint else "",
        "method": method[:10] if method else "",
        "status_code": status_code,
        "latency_ms": round(latency_ms, 3),
        "cache_result": cache_result,
        "user_id": user_id,
        "request_id": request_id,
        "content_id": content_id,
        "backend_ms": backend_ms,
        "db_ms": db_ms,
        "network_quality": network_quality,
    }

    try:
        _metric_queue.put_nowait(metric)
    except queue.Full:
        pass  # Drop metric if queue is full (backpressure)


def get_latency_stats(hours: int = 24) -> dict:
    """
    Compute latency statistics from the database.
    Returns P50, P95, P99, averages, and cache performance.
    """
    from app.extensions import db
    from app.models import LatencyMetric
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func, text

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    try:
        # Use database percentile functions when available (PostgreSQL)
        # Fall back to Python computation for SQLite
        results = (
            db.session.query(LatencyMetric)
            .filter(LatencyMetric.recorded_at >= cutoff)
            .filter(LatencyMetric.endpoint != "/api/v1/health")
            .all()
        )

        if not results:
            return _empty_stats()

        latencies = sorted([r.latency_ms for r in results])
        n = len(latencies)

        def percentile(data, p):
            idx = int(len(data) * p / 100)
            return round(data[min(idx, len(data) - 1)], 2)

        # Cache stats
        cache_hits = sum(1 for r in results if r.cache_result == "hit")
        prefetch_hits = sum(1 for r in results if r.cache_result == "prefetch_hit")
        offline_hits = sum(1 for r in results if r.cache_result == "offline_hit")
        misses = sum(1 for r in results if r.cache_result == "miss")
        total_cached = cache_hits + prefetch_hits + offline_hits

        error_count = sum(1 for r in results if r.status_code and r.status_code >= 500)

        return {
            "period_hours": hours,
            "total_requests": n,
            "avg_latency_ms": round(sum(latencies) / n, 2),
            "p50_latency_ms": percentile(latencies, 50),
            "p95_latency_ms": percentile(latencies, 95),
            "p99_latency_ms": percentile(latencies, 99),
            "min_latency_ms": round(latencies[0], 2),
            "max_latency_ms": round(latencies[-1], 2),
            "cache_hits": cache_hits,
            "prefetch_hits": prefetch_hits,
            "offline_hits": offline_hits,
            "cache_misses": misses,
            "cache_hit_rate": round(total_cached / n * 100, 2) if n > 0 else 0,
            "prefetch_hit_rate": round(prefetch_hits / n * 100, 2) if n > 0 else 0,
            "error_count": error_count,
            "error_rate": round(error_count / n * 100, 2) if n > 0 else 0,
        }
    except Exception as e:
        logger.warning("latency_stats_error", error=str(e))
        return _empty_stats()


def _empty_stats() -> dict:
    return {
        "period_hours": 0,
        "total_requests": 0,
        "avg_latency_ms": 0,
        "p50_latency_ms": 0,
        "p95_latency_ms": 0,
        "p99_latency_ms": 0,
        "min_latency_ms": 0,
        "max_latency_ms": 0,
        "cache_hits": 0,
        "prefetch_hits": 0,
        "offline_hits": 0,
        "cache_misses": 0,
        "cache_hit_rate": 0,
        "prefetch_hit_rate": 0,
        "error_count": 0,
        "error_rate": 0,
    }
