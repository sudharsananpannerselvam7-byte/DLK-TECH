from .routes import (
    health_bp, sources_bp, jobs_bp, search_bp, feed_bp,
    cache_bp, prefetch_bp, network_bp, storage_bp, users_bp, admin_bp,
    devices_bp, predictions_bp,
)
from .analytics.routes import analytics_bp
from .auth import auth_bp
from .content import content_bp

__all__ = [
    "health_bp", "sources_bp", "jobs_bp", "search_bp", "feed_bp",
    "cache_bp", "prefetch_bp", "network_bp", "storage_bp", "users_bp",
    "admin_bp", "analytics_bp", "auth_bp", "content_bp",
    "devices_bp", "predictions_bp",
]
