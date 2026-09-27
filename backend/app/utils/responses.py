"""
SmartFlow API Response Utilities
Consistent JSON response format across all endpoints.
"""
import uuid
import time
from typing import Any, Optional
from flask import jsonify, request, g
import structlog

logger = structlog.get_logger(__name__)


def _get_request_id() -> str:
    """Get or generate a request ID for tracing."""
    if hasattr(g, "request_id"):
        return g.request_id
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    g.request_id = request_id
    return request_id


def success_response(
    data: Any = None,
    message: Optional[str] = None,
    status_code: int = 200,
    meta: Optional[dict] = None
):
    """Return a successful API response."""
    payload = {
        "success": True,
        "data": data,
        "message": message,
        "request_id": _get_request_id(),
    }
    if meta:
        payload["meta"] = meta
    return jsonify(payload), status_code


def error_response(
    message: str,
    error_code: str = "INTERNAL_ERROR",
    status_code: int = 500,
    details: Optional[dict] = None
):
    """Return an error API response (never exposes stack traces)."""
    payload = {
        "success": False,
        "data": None,
        "message": message,
        "error_code": error_code,
        "request_id": _get_request_id(),
    }
    if details and not _is_production():
        payload["details"] = details
    return jsonify(payload), status_code


def _is_production() -> bool:
    from flask import current_app
    return not current_app.debug


def paginated_response(
    items: list,
    total: int,
    page: int,
    per_page: int,
    cursor: Optional[str] = None,
    next_cursor: Optional[str] = None,
):
    """Return a paginated list response."""
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 1
    return success_response(
        data=items,
        meta={
            "pagination": {
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
                "cursor": cursor,
                "next_cursor": next_cursor,
            }
        }
    )
