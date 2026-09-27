"""SmartFlow Health & Jobs & Sources & Search & Feed & Cache & Prefetch & Network & Storage & Users & Admin API"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt
from app.extensions import db, limiter
from app.utils import success_response, error_response

# ── Health ──────────────────────────────────────────────────────────────────
health_bp = Blueprint("health", __name__, url_prefix="/api/v1")

@health_bp.route("/health", methods=["GET"])
def health():
    checks = {}
    
    # Flask
    checks["flask"] = "ok"
    
    # Database
    try:
        db.session.execute(db.text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)[:100]}"
    
    # Redis/Cache
    try:
        from app.cache import get_cache
        result = get_cache().health_check()
        checks["cache"] = result["status"]
    except Exception as e:
        checks["cache"] = f"error: {str(e)[:100]}"
    
    # Storage
    import os
    from pathlib import Path
    storage_path = Path(os.environ.get("LOCAL_STORAGE_PATH", "uploads"))
    checks["storage"] = "ok" if storage_path.exists() else "missing"
    
    overall = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"
    status_code = 200 if overall == "healthy" else 503

    return success_response(
        data={"status": overall, "checks": checks, "version": "1.0.0"},
        status_code=status_code,
    )

@health_bp.route("/health/ready", methods=["GET"])
def readiness():
    try:
        db.session.execute(db.text("SELECT 1"))
        return success_response(data={"ready": True})
    except Exception:
        return error_response("Not ready", "NOT_READY", 503)

@health_bp.route("/health/live", methods=["GET"])
def liveness():
    return success_response(data={"live": True})


# ── Sources ──────────────────────────────────────────────────────────────────
sources_bp = Blueprint("sources", __name__, url_prefix="/api/v1/sources")

@sources_bp.route("", methods=["GET"])
@jwt_required()
def list_sources():
    from app.models import ContentSource
    user_id = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role", "viewer")
    
    if role in ("admin", "manager"):
        sources = ContentSource.query.filter_by(deleted_at=None).all()
    else:
        sources = ContentSource.query.filter_by(owner_id=user_id, deleted_at=None).all()
    
    return success_response(data=[_source_dict(s) for s in sources])

@sources_bp.route("", methods=["POST"])
@jwt_required()
def create_source():
    from app.models import ContentSource
    user_id = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    
    name = data.get("name", "").strip()
    adapter_type = data.get("adapter_type", "local")
    config = data.get("config", {})
    
    if not name:
        return error_response("Source name is required.", "VALIDATION_ERROR", 400)
    
    if adapter_type not in ("google_drive", "s3", "local", "api", "minio"):
        return error_response("Unsupported adapter type.", "INVALID_TYPE", 400)
    
    # SSRF protection: never allow user-supplied base_path to escape uploads/
    if adapter_type == "local":
        import re
        base = config.get("base_path", "uploads")
        if ".." in base or base.startswith("/") or re.match(r"[A-Za-z]:\\", base):
            return error_response("Invalid path.", "INVALID_PATH", 400)
    
    source = ContentSource(
        name=name,
        adapter_type=adapter_type,
        config=config,
        owner_id=user_id,
    )
    db.session.add(source)
    db.session.commit()
    return success_response(data=_source_dict(source), status_code=201)

@sources_bp.route("/<source_id>/sync", methods=["POST"])
@jwt_required()
def sync_source(source_id: str):
    from app.models import ContentSource
    from app.workers.ingestion_tasks import sync_source as sync_task
    user_id = get_jwt_identity()
    
    source = ContentSource.query.filter_by(id=source_id, deleted_at=None).first()
    if not source:
        return error_response("Source not found.", "NOT_FOUND", 404)
    if source.owner_id != user_id and get_jwt().get("role") not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    
    force = request.get_json(silent=True or {}).get("force", False) if request.is_json else False
    sync_task.delay(source_id=source_id, force=bool(force))
    return success_response(message="Sync started.", data={"source_id": source_id})

@sources_bp.route("/<source_id>", methods=["DELETE"])
@jwt_required()
def delete_source(source_id: str):
    from app.models import ContentSource
    user_id = get_jwt_identity()
    
    source = ContentSource.query.filter_by(id=source_id, deleted_at=None).first()
    if not source:
        return error_response("Source not found.", "NOT_FOUND", 404)
    if source.owner_id != user_id and get_jwt().get("role") not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    
    source.soft_delete()
    db.session.commit()
    return success_response(message="Source deleted.")

def _source_dict(s):
    safe_config = {k: v for k, v in s.config.items() if k not in ("service_account_json", "secret_key", "password")}
    return {
        "id": s.id, "name": s.name, "adapter_type": s.adapter_type,
        "is_active": s.is_active, "last_synced_at": s.last_synced_at.isoformat() if s.last_synced_at else None,
        "config": safe_config, "created_at": s.created_at.isoformat() if s.created_at else None,
    }


# ── Jobs ─────────────────────────────────────────────────────────────────────
jobs_bp = Blueprint("jobs", __name__, url_prefix="/api/v1/jobs")

@jobs_bp.route("", methods=["GET"])
@jwt_required()
def list_jobs():
    from app.models import ProcessingJob
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, int(request.args.get("per_page", 20)))
    status = request.args.get("status")
    
    q = ProcessingJob.query
    if status:
        q = q.filter_by(status=status)
    
    total = q.count()
    jobs = q.order_by(ProcessingJob.created_at.desc()).offset((page-1)*per_page).limit(per_page).all()
    return success_response(data=[_job_dict(j) for j in jobs], meta={"total": total, "page": page})

@jobs_bp.route("/<job_id>", methods=["GET"])
@jwt_required()
def get_job(job_id: str):
    from app.models import ProcessingJob
    job = ProcessingJob.query.get(job_id)
    if not job:
        return error_response("Job not found.", "NOT_FOUND", 404)
    return success_response(data=_job_dict(job, include_events=True))

@jobs_bp.route("/<job_id>/cancel", methods=["POST"])
@jwt_required()
def cancel_job(job_id: str):
    from app.models import ProcessingJob
    job = ProcessingJob.query.get(job_id)
    if not job:
        return error_response("Job not found.", "NOT_FOUND", 404)
    if job.status in ("completed", "failed", "cancelled"):
        return error_response("Job cannot be cancelled.", "INVALID_STATE", 409)
    job.status = "cancelled"
    db.session.commit()
    return success_response(message="Job cancelled.")

@jobs_bp.route("/<job_id>/retry", methods=["POST"])
@jwt_required()
def retry_job(job_id: str):
    from app.models import ProcessingJob
    job = ProcessingJob.query.get(job_id)
    if not job:
        return error_response("Job not found.", "NOT_FOUND", 404)
    if job.status != "failed":
        return error_response("Only failed jobs can be retried.", "INVALID_STATE", 409)
    job.status = "queued"
    job.retry_count += 1
    job.error_message = None
    db.session.commit()
    # Re-queue based on job type
    if job.job_type in ("transcode", "hls") and job.input_data.get("source_path"):
        from app.workers.media_tasks import process_video
        process_video.delay(job.id, job.content_id, job.input_data["source_path"])
    return success_response(message="Job requeued.")

def _job_dict(j, include_events=False):
    d = {
        "id": j.id, "job_type": j.job_type, "status": j.status,
        "progress": j.progress, "priority": j.priority,
        "content_id": j.content_id, "error_message": j.error_message,
        "retry_count": j.retry_count,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "started_at": j.started_at.isoformat() if j.started_at else None,
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    }
    if include_events:
        d["events"] = [{"type": e.event_type, "message": e.message, "created_at": e.created_at.isoformat() if e.created_at else None} for e in j.events]
    return d


# ── Search ───────────────────────────────────────────────────────────────────
search_bp = Blueprint("search", __name__, url_prefix="/api/v1/search")

@search_bp.route("", methods=["GET"])
@limiter.limit("60 per minute")
def search():
    from app.models import Content
    q = request.args.get("q", "").strip()
    if not q or len(q) < 2:
        return error_response("Search query must be at least 2 characters.", "VALIDATION_ERROR", 400)
    
    content_type = request.args.get("type")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, int(request.args.get("per_page", 20)))
    
    from app.cache import get_cache, cache_key_for
    cache = get_cache()
    ck = cache_key_for("search", q, content_type or "", page, per_page)
    cached = cache.get("search", ck)
    if cached:
        return success_response(**cached)
    
    query = Content.query.filter(
        Content.deleted_at == None,
        Content.is_public == True,
        Content.title.ilike(f"%{q}%"),
    )
    if content_type:
        query = query.filter_by(content_type=content_type)
    
    total = query.count()
    items = query.order_by(Content.created_at.desc()).offset((page-1)*per_page).limit(per_page).all()
    
    from app.api.content.routes import _content_to_dict
    data = [_content_to_dict(c) for c in items]
    meta = {"total": total, "page": page, "per_page": per_page, "query": q}
    cache.set("search", ck, {"data": data, "meta": meta}, ttl=30)
    return success_response(data=data, meta=meta)


# ── Feed ─────────────────────────────────────────────────────────────────────
feed_bp = Blueprint("feed", __name__, url_prefix="/api/v1/feed")

@feed_bp.route("", methods=["GET"])
def get_feed():
    from app.models import Content
    from app.api.content.routes import _content_to_dict
    from app.cache import get_cache, cache_key_for
    
    cursor = request.args.get("cursor")
    limit = min(50, max(1, int(request.args.get("limit", 20))))
    content_type = request.args.get("type")
    
    cache = get_cache()
    ck = cache_key_for("feed_cursor", cursor or "none", limit, content_type or "")
    cached = cache.get("feed", ck)
    if cached:
        resp = success_response(**cached)
        resp[0].headers["X-Cache"] = "HIT"
        return resp
    
    q = Content.query.filter(Content.deleted_at == None, Content.is_public == True)
    if content_type:
        q = q.filter_by(content_type=content_type)
    if cursor:
        import base64
        try:
            decoded = base64.b64decode(cursor).decode()
            q = q.filter(Content.created_at < decoded)
        except Exception:
            pass
    
    items = q.order_by(Content.created_at.desc()).limit(limit + 1).all()
    has_next = len(items) > limit
    items = items[:limit]
    
    next_cursor = None
    if has_next and items:
        import base64
        next_cursor = base64.b64encode(items[-1].created_at.isoformat().encode()).decode()
    
    data = [_content_to_dict(c) for c in items]
    meta = {"has_next": has_next, "next_cursor": next_cursor, "limit": limit}
    cache.set("feed", ck, {"data": data, "meta": meta}, ttl=30)
    return success_response(data=data, meta=meta)


# ── Cache Monitor ────────────────────────────────────────────────────────────
cache_bp = Blueprint("cache_api", __name__, url_prefix="/api/v1/cache")

@cache_bp.route("/status", methods=["GET"])
@jwt_required()
def cache_status():
    from app.cache import get_cache
    cache = get_cache()
    return success_response(data={
        "metrics": cache.get_metrics(),
        "health": cache.health_check(),
        "version": cache.CACHE_VERSION,
    })

@cache_bp.route("/invalidate/<content_id>", methods=["POST"])
@jwt_required()
def invalidate(content_id: str):
    claims = get_jwt()
    if claims.get("role") not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    from app.cache import get_cache
    get_cache().invalidate_content(content_id)
    return success_response(message=f"Cache invalidated for {content_id}.")

@cache_bp.route("/warm/<content_id>", methods=["POST"])
@jwt_required()
def warm(content_id: str):
    claims = get_jwt()
    if claims.get("role") not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    from app.workers.cache_tasks import warm_cache
    warm_cache.delay(content_id)
    return success_response(message="Cache warming queued.")


# ── Prefetch ─────────────────────────────────────────────────────────────────
prefetch_bp = Blueprint("prefetch", __name__, url_prefix="/api/v1/prefetch")

@prefetch_bp.route("", methods=["POST"])
@jwt_required()
def request_prefetch():
    """Request prefetch for likely-next content items."""
    data = request.get_json(silent=True) or {}
    content_ids = data.get("content_ids", [])[:5]  # Max 5
    network_quality = data.get("network_quality", "medium")
    user_id = get_jwt_identity()
    
    if not content_ids:
        return error_response("content_ids is required.", "VALIDATION_ERROR", 400)
    
    from app.models import PrefetchJob, Content
    from datetime import timezone, timedelta
    from datetime import datetime
    
    created = []
    for cid in content_ids:
        content = Content.query.filter_by(id=cid, deleted_at=None).first()
        if not content:
            continue
        
        existing = PrefetchJob.query.filter_by(content_id=cid, status="ready").first()
        if existing:
            created.append({"content_id": cid, "status": "already_ready"})
            continue
        
        job = PrefetchJob(
            content_id=cid,
            user_id=user_id,
            status="pending",
            network_quality=network_quality,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )
        db.session.add(job)
        created.append({"content_id": cid, "status": "queued"})
    
    db.session.commit()
    return success_response(data={"prefetched": created})

@prefetch_bp.route("/status", methods=["GET"])
@jwt_required()
def prefetch_status():
    """GET prefetch status for given content IDs."""
    ids = request.args.getlist("ids")
    if not ids:
        return error_response("ids parameter required.", "VALIDATION_ERROR", 400)
    
    from app.models import PrefetchJob
    results = {}
    for cid in ids[:20]:
        job = PrefetchJob.query.filter_by(content_id=cid).order_by(PrefetchJob.created_at.desc()).first()
        results[cid] = job.status if job else "not_requested"
    
    return success_response(data=results)


# ── Network Monitor ───────────────────────────────────────────────────────────
network_bp = Blueprint("network", __name__, url_prefix="/api/v1/network")

@network_bp.route("/report", methods=["POST"])
@jwt_required()
def report_network():
    """Report client network conditions."""
    data = request.get_json(silent=True) or {}
    user_id = get_jwt_identity()
    
    from app.models import NetworkMetric
    metric = NetworkMetric(
        user_id=user_id,
        rtt_ms=data.get("rtt_ms"),
        bandwidth_mbps=data.get("bandwidth_mbps"),
        quality=data.get("quality"),
        is_online=data.get("is_online", True),
    )
    db.session.add(metric)
    db.session.commit()
    return success_response(message="Network metric recorded.")

@network_bp.route("/stats", methods=["GET"])
@jwt_required()
def network_stats():
    """GET network quality stats."""
    from app.models import NetworkMetric
    from sqlalchemy import func
    from datetime import datetime, timezone, timedelta
    
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    metrics = NetworkMetric.query.filter(NetworkMetric.recorded_at >= cutoff).all()
    
    if not metrics:
        return success_response(data={"message": "No metrics in last hour."})
    
    rtts = [m.rtt_ms for m in metrics if m.rtt_ms]
    bws = [m.bandwidth_mbps for m in metrics if m.bandwidth_mbps]
    online_count = sum(1 for m in metrics if m.is_online)
    
    return success_response(data={
        "sample_count": len(metrics),
        "online_rate": round(online_count / len(metrics) * 100, 1) if metrics else 0,
        "avg_rtt_ms": round(sum(rtts)/len(rtts), 2) if rtts else None,
        "avg_bandwidth_mbps": round(sum(bws)/len(bws), 2) if bws else None,
        "quality_distribution": {q: sum(1 for m in metrics if m.quality == q) for q in ("fast","medium","slow","offline")},
    })


# ── Storage ───────────────────────────────────────────────────────────────────
storage_bp = Blueprint("storage", __name__, url_prefix="/api/v1/storage")

@storage_bp.route("/stats", methods=["GET"])
@jwt_required()
def storage_stats():
    from app.models import StorageObject
    from sqlalchemy import func
    stats = db.session.query(
        func.count(StorageObject.id),
        func.coalesce(func.sum(StorageObject.size_bytes), 0),
    ).first()
    return success_response(data={
        "total_objects": stats[0],
        "total_bytes": stats[1],
        "total_gb": round(stats[1] / (1024**3), 3) if stats[1] else 0,
    })

@storage_bp.route("/file/<path:key>", methods=["GET"])
def serve_file(key: str):
    """Serve stored files (thumbnails, HLS segments, etc.)"""
    import os, mimetypes
    from pathlib import Path
    from flask import send_file
    
    base = Path(os.environ.get("LOCAL_STORAGE_PATH", "uploads"))
    # Path traversal protection
    try:
        file_path = (base / key).resolve()
        file_path.relative_to(base.resolve())
    except ValueError:
        return error_response("Invalid path.", "FORBIDDEN", 403)
    
    if not file_path.exists():
        return error_response("File not found.", "NOT_FOUND", 404)
    
    mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return send_file(str(file_path), mimetype=mime)


# ── Users (Admin) ────────────────────────────────────────────────────────────
users_bp = Blueprint("users", __name__, url_prefix="/api/v1/users")

@users_bp.route("", methods=["GET"])
@jwt_required()
def list_users():
    claims = get_jwt()
    if claims.get("role") not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    
    from app.models import User
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, int(request.args.get("per_page", 20)))
    
    q = User.query.filter_by(deleted_at=None)
    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page-1)*per_page).limit(per_page).all()
    
    return success_response(
        data=[_user_dict(u) for u in users],
        meta={"total": total, "page": page},
    )

@users_bp.route("/<user_id>", methods=["GET"])
@jwt_required()
def get_user(user_id: str):
    from app.models import User
    current_id = get_jwt_identity()
    claims = get_jwt()
    
    if user_id != current_id and claims.get("role") not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    
    user = User.query.filter_by(id=user_id, deleted_at=None).first()
    if not user:
        return error_response("User not found.", "NOT_FOUND", 404)
    return success_response(data=_user_dict(user, include_email=True))

@users_bp.route("/<user_id>", methods=["PATCH"])
@jwt_required()
def update_user(user_id: str):
    from app.models import User
    current_id = get_jwt_identity()
    claims = get_jwt()
    
    if user_id != current_id and claims.get("role") not in ("admin",):
        return error_response("Permission denied.", "FORBIDDEN", 403)
    
    user = User.query.filter_by(id=user_id, deleted_at=None).first()
    if not user:
        return error_response("User not found.", "NOT_FOUND", 404)
    
    data = request.get_json(silent=True) or {}
    if "full_name" in data:
        user.full_name = data["full_name"][:255]
    if "avatar_url" in data:
        user.avatar_url = data["avatar_url"][:500]
    if "is_active" in data and claims.get("role") == "admin":
        user.is_active = bool(data["is_active"])
    
    db.session.commit()
    return success_response(data=_user_dict(user, include_email=True), message="Profile updated.")

def _user_dict(u, include_email=False):
    d = {
        "id": u.id, "username": u.username, "full_name": u.full_name,
        "avatar_url": u.avatar_url, "is_active": u.is_active,
        "role": u.role.name if u.role else "viewer",
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }
    if include_email:
        d["email"] = u.email
    return d


# ── Admin ────────────────────────────────────────────────────────────────────
admin_bp = Blueprint("admin", __name__, url_prefix="/api/v1/admin")

@admin_bp.route("/dashboard", methods=["GET"])
@jwt_required()
def admin_dashboard():
    from app.services import require_role
    claims = get_jwt()
    if claims.get("role") != "admin":
        return error_response("Admin access required.", "FORBIDDEN", 403)
    
    from app.models import User, Content, ProcessingJob, ContentSource
    from app.cache import get_cache
    from sqlalchemy import func
    
    users_count = User.query.filter_by(deleted_at=None, is_active=True).count()
    content_count = Content.query.filter_by(deleted_at=None).count()
    active_jobs = ProcessingJob.query.filter(ProcessingJob.status.in_(["pending","queued","processing"])).count()
    sources_count = ContentSource.query.filter_by(deleted_at=None, is_active=True).count()
    
    return success_response(data={
        "users": {"active": users_count},
        "content": {"total": content_count},
        "jobs": {"active": active_jobs},
        "sources": {"active": sources_count},
        "cache": get_cache().get_metrics(),
        "cache_health": get_cache().health_check(),
    })

@admin_bp.route("/audit-logs", methods=["GET"])
@jwt_required()
def audit_logs():
    claims = get_jwt()
    if claims.get("role") != "admin":
        return error_response("Admin access required.", "FORBIDDEN", 403)
    
    from app.models import AuditLog
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, int(request.args.get("per_page", 50)))
    
    q = AuditLog.query.order_by(AuditLog.recorded_at.desc())
    total = q.count()
    logs = q.offset((page-1)*per_page).limit(per_page).all()
    
    return success_response(
        data=[{
            "id": l.id, "action": l.action, "user_id": l.user_id,
            "resource_type": l.resource_type, "resource_id": l.resource_id,
            "ip_address": l.ip_address, "success": l.success,
            "recorded_at": l.recorded_at.isoformat() if l.recorded_at else None,
        } for l in logs],
        meta={"total": total, "page": page},
    )
