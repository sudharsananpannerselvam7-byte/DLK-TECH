"""
SmartFlow Cache Tasks
Background cache warming, invalidation, and prefetch preparation.
"""
import structlog
from app.workers.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task(name="app.workers.cache_tasks.warm_cache")
def warm_cache(content_id: str):
    """Pre-populate cache for a content item to reduce first-access latency."""
    from app.extensions import db
    from app.models import Content
    from app.cache import get_cache

    logger.info("cache_warming", content_id=content_id)
    try:
        content = Content.query.get(content_id)
        if not content:
            return

        cache = get_cache()
        content_data = {
            "id": content.id,
            "title": content.title,
            "content_type": content.content_type,
            "mime_type": content.mime_type,
            "duration_seconds": content.duration_seconds,
            "thumbnail_url": content.thumbnail_url,
            "size_bytes": content.size_bytes,
            "metadata": content.metadata_,
        }
        cache.set("content", content_id, content_data, ttl=3600)
        logger.info("cache_warmed", content_id=content_id)
    except Exception as e:
        logger.warning("cache_warm_failed", content_id=content_id, error=str(e))


@celery_app.task(name="app.workers.cache_tasks.invalidate_content_cache")
def invalidate_content_cache(content_id: str):
    """Invalidate all cache entries for a content item."""
    from app.cache import get_cache
    try:
        get_cache().invalidate_content(content_id)
        logger.info("cache_invalidated", content_id=content_id)
    except Exception as e:
        logger.warning("cache_invalidation_failed", content_id=content_id, error=str(e))


@celery_app.task(name="app.workers.cache_tasks.cleanup_expired")
def cleanup_expired():
    """Remove expired cache entries from the database."""
    from app.extensions import db
    from app.models import CacheEntry
    from datetime import datetime, timezone

    try:
        now = datetime.now(timezone.utc)
        deleted = CacheEntry.query.filter(
            CacheEntry.expires_at < now
        ).delete()
        db.session.commit()
        logger.info("cache_cleanup_complete", deleted=deleted)
    except Exception as e:
        logger.warning("cache_cleanup_failed", error=str(e))
