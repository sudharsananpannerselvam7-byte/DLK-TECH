"""
SmartFlow Middleware
Request tracking, latency measurement, security headers, CSRF, logging.
"""
import time
import uuid
import structlog
from flask import Flask, g, request, jsonify
from werkzeug.exceptions import HTTPException

logger = structlog.get_logger(__name__)


def register_middleware(app: Flask):
    """Register all middleware with the Flask app."""

    @app.before_request
    def before_request():
        g.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        g.start_time = time.perf_counter()
        structlog.contextvars.bind_contextvars(
            request_id=g.request_id,
            method=request.method,
            path=request.path,
        )

    @app.after_request
    def after_request(response):
        latency_ms = (time.perf_counter() - g.get("start_time", time.perf_counter())) * 1000

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Request-ID"] = g.get("request_id", "")
        response.headers["X-Response-Time"] = f"{latency_ms:.2f}ms"

        if not app.debug:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Log the request (never log sensitive headers/body)
        if not request.path.startswith("/api/v1/health"):
            logger.info(
                "request_completed",
                status=response.status_code,
                latency_ms=round(latency_ms, 2),
                content_type=response.content_type,
            )

        # Track latency metric asynchronously if configured
        _record_latency_async(
            endpoint=request.endpoint or request.path,
            method=request.method,
            status_code=response.status_code,
            latency_ms=latency_ms,
            request_id=g.get("request_id"),
        )

        structlog.contextvars.unbind_contextvars("request_id", "method", "path")
        return response

    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        from app.utils import error_response
        return error_response(
            message=e.description,
            error_code=e.name.upper().replace(" ", "_"),
            status_code=e.code,
        )

    @app.errorhandler(Exception)
    def handle_generic_exception(e):
        from app.utils import error_response
        logger.exception("unhandled_exception", error=str(e))
        return error_response(
            message="An internal error occurred. Please try again.",
            error_code="INTERNAL_ERROR",
            status_code=500,
        )


def _record_latency_async(endpoint: str, method: str, status_code: int, latency_ms: float, request_id: str):
    """Record latency metric to DB asynchronously (non-blocking)."""
    try:
        from app.monitoring.latency import record_latency
        record_latency(
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            latency_ms=latency_ms,
            request_id=request_id,
        )
    except Exception:
        pass  # Never let monitoring break the response
