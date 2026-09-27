"""
SmartFlow Content API
CRUD for content items, streaming, file serving, metadata.
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, request, Response, stream_with_context, g
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, verify_jwt_in_request
from app.extensions import db, limiter
from app.models import Content, ContentVersion, StorageObject, ProcessingJob
from app.cache import get_cache, cache_key_for
from app.utils import success_response, error_response, paginated_response
from app.workers.media_tasks import process_video
import structlog

logger = structlog.get_logger(__name__)
content_bp = Blueprint("content", __name__, url_prefix="/api/v1/content")

UPLOAD_DIR = Path(os.environ.get("LOCAL_STORAGE_PATH", "uploads"))
UPLOAD_CHUNK_SIZE = 65536


def _optional_auth():
    try:
        verify_jwt_in_request(optional=True)
        return get_jwt_identity()
    except Exception:
        return None


@content_bp.route("", methods=["GET"])
def list_content():
    """GET /api/v1/content — list all public content with pagination"""
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 20))))
    content_type = request.args.get("type")
    search = request.args.get("q", "").strip()

    user_id = _optional_auth()
    cache = get_cache()
    cache_key = cache_key_for("content_list", page, per_page, content_type or "", search)

    # Try cache first
    cached = cache.get("feed", cache_key)
    if cached:
        response = success_response(**cached)
        response[0].headers["X-Cache"] = "HIT"
        return response

    query = Content.query.filter_by(deleted_at=None)

    if not user_id:
        query = query.filter_by(is_public=True)

    if content_type:
        query = query.filter_by(content_type=content_type)
    if search:
        query = query.filter(Content.title.ilike(f"%{search}%"))

    total = query.count()
    items = (
        query.order_by(Content.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    data = [_content_to_dict(c) for c in items]

    payload = {
        "data": data,
        "meta": {
            "pagination": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": (total + per_page - 1) // per_page,
                "has_next": page * per_page < total,
                "has_prev": page > 1,
            }
        }
    }
    cache.set("feed", cache_key, payload, ttl=60)
    return success_response(data=data, meta=payload["meta"])


@content_bp.route("/<content_id>", methods=["GET"])
def get_content(content_id: str):
    """GET /api/v1/content/<id> — get content details"""
    user_id = _optional_auth()
    cache = get_cache()

    cached = cache.get("content", content_id)
    if cached:
        resp = success_response(data=cached)
        resp[0].headers["X-Cache"] = "HIT"
        return resp

    content = Content.query.filter_by(id=content_id, deleted_at=None).first()
    if not content:
        return error_response("Content not found.", "NOT_FOUND", 404)

    if not content.is_public and not user_id:
        return error_response("Authentication required.", "UNAUTHORIZED", 401)

    # Track view
    content.view_count = (content.view_count or 0) + 1
    db.session.commit()

    data = _content_to_dict(content, include_versions=True)
    cache.set("content", content_id, data, ttl=300)
    return success_response(data=data)


@content_bp.route("/upload", methods=["POST"])
@jwt_required()
@limiter.limit("20 per hour")
def upload_content():
    """POST /api/v1/content/upload — direct file upload"""
    user_id = get_jwt_identity()

    if "file" not in request.files:
        return error_response("No file provided.", "NO_FILE", 400)

    file = request.files["file"]
    if not file.filename:
        return error_response("No file selected.", "NO_FILE", 400)

    # Validate file type
    allowed_mime_prefixes = ("video/", "image/", "audio/", "application/pdf", "text/")
    mime = file.content_type or ""
    if not any(mime.startswith(p) for p in allowed_mime_prefixes):
        return error_response(f"File type '{mime}' is not supported.", "UNSUPPORTED_TYPE", 400)

    content_id = str(uuid.uuid4())
    ext = Path(file.filename).suffix.lower()[:10]
    safe_filename = f"{content_id}{ext}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = UPLOAD_DIR / "ingested" / safe_filename
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # Stream to disk (never load entire file into memory)
    bytes_written = 0
    try:
        with open(dest_path, "wb") as f:
            while True:
                chunk = file.stream.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                f.write(chunk)
                bytes_written += len(chunk)
    except Exception as e:
        return error_response("Upload failed.", "UPLOAD_ERROR", 500)

    title = request.form.get("title") or Path(file.filename).stem
    description = request.form.get("description", "")

    from slugify import slugify
    slug_base = slugify(title)[:400]
    slug = slug_base
    counter = 0
    while Content.query.filter_by(slug=slug).first():
        counter += 1
        slug = f"{slug_base}-{counter}"

    content_type_val = "video" if mime.startswith("video/") else (
        "image" if mime.startswith("image/") else "document"
    )

    content = Content(
        id=content_id,
        title=title,
        description=description,
        content_type=content_type_val,
        mime_type=mime,
        size_bytes=bytes_written,
        slug=slug,
        uploaded_by=user_id,
        is_public=request.form.get("is_public", "false").lower() == "true",
    )
    db.session.add(content)

    storage = StorageObject(
        content_id=content_id,
        object_key=f"ingested/{safe_filename}",
        bucket="local",
        size_bytes=bytes_written,
        mime_type=mime,
    )
    db.session.add(storage)

    # Create processing job
    if content_type_val == "video":
        job = ProcessingJob(
            content_id=content_id,
            job_type="transcode",
            status="queued",
            input_data={"source_path": str(dest_path)},
        )
        db.session.add(job)
        db.session.flush()
        process_video.delay(job.id, content_id, str(dest_path))

    db.session.commit()
    logger.info("content_uploaded", content_id=content_id, size=bytes_written)

    return success_response(
        data=_content_to_dict(content),
        message="File uploaded and queued for processing.",
        status_code=201,
    )


@content_bp.route("/<content_id>/stream", methods=["GET"])
def stream_content(content_id: str):
    """
    GET /api/v1/content/<id>/stream — stream content with range support.
    Supports HTTP 206 Partial Content for video seeking.
    """
    user_id = _optional_auth()

    content = Content.query.filter_by(id=content_id, deleted_at=None).first()
    if not content:
        return error_response("Content not found.", "NOT_FOUND", 404)

    if not content.is_public and not user_id:
        return error_response("Authentication required.", "UNAUTHORIZED", 401)

    # Find the storage object
    storage = StorageObject.query.filter_by(content_id=content_id).first()
    if not storage:
        return error_response("File not available.", "FILE_NOT_FOUND", 404)

    file_path = UPLOAD_DIR / storage.object_key.replace("ingested/", "ingested/")
    if not file_path.exists():
        # Try alternative paths
        for base in [UPLOAD_DIR, UPLOAD_DIR / "ingested", UPLOAD_DIR / "hls"]:
            alt = base / Path(storage.object_key).name
            if alt.exists():
                file_path = alt
                break
        else:
            return error_response("File not found on disk.", "FILE_NOT_FOUND", 404)

    file_size = file_path.stat().st_size
    mime = content.mime_type or "application/octet-stream"

    # Handle Range requests for video seeking
    range_header = request.headers.get("Range")
    if range_header:
        try:
            range_match = range_header.replace("bytes=", "").split("-")
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1

            def generate_range():
                with open(file_path, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(UPLOAD_CHUNK_SIZE, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk

            response = Response(
                stream_with_context(generate_range()),
                status=206,
                mimetype=mime,
                content_type=mime,
                direct_passthrough=True,
            )
            response.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            response.headers["Content-Length"] = str(length)
            response.headers["Accept-Ranges"] = "bytes"
            response.headers["Cache-Control"] = "public, max-age=3600"
            return response
        except (ValueError, IndexError):
            pass

    # Full stream
    def generate_full():
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk

    response = Response(
        stream_with_context(generate_full()),
        status=200,
        mimetype=mime,
    )
    response.headers["Content-Length"] = str(file_size)
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@content_bp.route("/<content_id>", methods=["PATCH"])
@jwt_required()
def update_content(content_id: str):
    """PATCH /api/v1/content/<id> — update content metadata"""
    user_id = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role", "viewer")

    content = Content.query.filter_by(id=content_id, deleted_at=None).first()
    if not content:
        return error_response("Content not found.", "NOT_FOUND", 404)

    if content.uploaded_by != user_id and role not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)

    data = request.get_json(silent=True) or {}
    if "title" in data:
        content.title = data["title"][:500]
    if "description" in data:
        content.description = data["description"]
    if "is_public" in data:
        content.is_public = bool(data["is_public"])
    if "tags" in data and isinstance(data["tags"], list):
        content.tags = data["tags"][:20]

    db.session.commit()
    get_cache().invalidate_content(content_id)
    return success_response(data=_content_to_dict(content), message="Content updated.")


@content_bp.route("/<content_id>", methods=["DELETE"])
@jwt_required()
def delete_content(content_id: str):
    """DELETE /api/v1/content/<id> — soft delete"""
    user_id = get_jwt_identity()
    claims = get_jwt()
    role = claims.get("role", "viewer")

    content = Content.query.filter_by(id=content_id, deleted_at=None).first()
    if not content:
        return error_response("Content not found.", "NOT_FOUND", 404)

    if content.uploaded_by != user_id and role not in ("admin", "manager"):
        return error_response("Permission denied.", "FORBIDDEN", 403)

    content.soft_delete()
    db.session.commit()
    get_cache().invalidate_content(content_id)
    return success_response(message="Content deleted.")


def _content_to_dict(content: Content, include_versions: bool = False) -> dict:
    d = {
        "id": content.id,
        "title": content.title,
        "description": content.description,
        "content_type": content.content_type,
        "mime_type": content.mime_type,
        "size_bytes": content.size_bytes,
        "duration_seconds": content.duration_seconds,
        "width": content.width,
        "height": content.height,
        "thumbnail_url": content.thumbnail_url,
        "slug": content.slug,
        "tags": content.tags or [],
        "is_public": content.is_public,
        "view_count": content.view_count,
        "created_at": content.created_at.isoformat() if content.created_at else None,
        "updated_at": content.updated_at.isoformat() if content.updated_at else None,
        "stream_url": f"/api/v1/content/{content.id}/stream",
    }
    if include_versions:
        d["versions"] = [
            {
                "id": v.id,
                "quality_label": v.quality_label,
                "storage_key": v.storage_key,
                "is_hls": v.is_hls,
                "size_bytes": v.size_bytes,
            }
            for v in content.versions
        ]
    return d
