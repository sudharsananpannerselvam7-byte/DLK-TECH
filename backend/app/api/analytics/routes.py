"""SmartFlow Analytics API"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.monitoring.latency import get_latency_stats
from app.utils import success_response, error_response
from app.extensions import db
from app.models import Content, ProcessingJob, PrefetchJob, CacheEntry
from app.cache import get_cache

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/v1/analytics")


@analytics_bp.route("/latency", methods=["GET"])
@jwt_required()
def latency_stats():
    """GET /api/v1/analytics/latency — P50/P95/P99 latency stats"""
    hours = int(request.args.get("hours", 24))
    hours = min(max(hours, 1), 720)
    stats = get_latency_stats(hours=hours)
    return success_response(data=stats)


@analytics_bp.route("/cache", methods=["GET"])
@jwt_required()
def cache_stats():
    """GET /api/v1/analytics/cache — cache hit/miss rates"""
    cache = get_cache()
    metrics = cache.get_metrics()
    
    # DB-level cache entry stats
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    total_entries = CacheEntry.query.count()
    stale_entries = CacheEntry.query.filter_by(is_stale=True).count()
    
    return success_response(data={
        **metrics,
        "db_cache_entries": total_entries,
        "stale_entries": stale_entries,
        "cache_health": cache.health_check(),
    })


@analytics_bp.route("/prefetch", methods=["GET"])
@jwt_required()
def prefetch_stats():
    """GET /api/v1/analytics/prefetch — prefetch performance metrics"""
    total = PrefetchJob.query.count()
    used = PrefetchJob.query.filter_by(was_used=True).count()
    ready = PrefetchJob.query.filter_by(status="ready").count()
    failed = PrefetchJob.query.filter_by(status="failed").count()
    
    hit_rate = round(used / total * 100, 2) if total > 0 else 0

    return success_response(data={
        "total_prefetch_jobs": total,
        "prefetch_hits": used,
        "ready": ready,
        "failed": failed,
        "prefetch_hit_rate": hit_rate,
    })


@analytics_bp.route("/jobs", methods=["GET"])
@jwt_required()
def job_stats():
    """GET /api/v1/analytics/jobs — processing job statistics"""
    from sqlalchemy import func
    stats = (
        db.session.query(ProcessingJob.status, func.count(ProcessingJob.id))
        .group_by(ProcessingJob.status)
        .all()
    )
    return success_response(data={
        "by_status": {s: c for s, c in stats},
        "total": sum(c for _, c in stats),
    })


@analytics_bp.route("/overview", methods=["GET"])
@jwt_required()
def overview():
    """GET /api/v1/analytics/overview — combined dashboard metrics"""
    latency = get_latency_stats(hours=24)
    cache = get_cache().get_metrics()
    
    total_content = Content.query.filter_by(deleted_at=None).count()
    active_jobs = ProcessingJob.query.filter(
        ProcessingJob.status.in_(["pending", "queued", "processing"])
    ).count()
    
    return success_response(data={
        "latency": latency,
        "cache": cache,
        "content": {"total": total_content},
        "jobs": {"active": active_jobs},
    })
