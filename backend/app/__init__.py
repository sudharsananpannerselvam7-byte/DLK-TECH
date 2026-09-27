"""
SmartFlow Flask Application Factory
Creates and configures the Flask application with all extensions,
blueprints, middleware, and database migrations.
"""
import os
import logging
import structlog
from flask import Flask
from flask_cors import CORS

from app.config import get_config
from app.extensions import db, migrate, jwt, limiter


def configure_logging(app: Flask):
    """Configure structured JSON logging."""
    level = getattr(logging, app.config.get("LOG_LEVEL", "INFO"), logging.INFO)
    logging.basicConfig(level=level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer() if not app.debug else structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def create_app(env: str = None) -> Flask:
    """Application factory — creates a fully configured Flask application."""
    config = get_config(env)

    app = Flask(__name__)
    app.config.from_object(config)

    configure_logging(app)
    logger = structlog.get_logger(__name__)

    # ── Extensions ───────────────────────────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)

    CORS(app, resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", ["*"])}})

    # ── Cache ─────────────────────────────────────────────────────────────────
    from app.cache import init_cache
    init_cache(app)

    # ── Blueprints ────────────────────────────────────────────────────────────
    from app.api import (
        health_bp, auth_bp, content_bp, analytics_bp,
        sources_bp, jobs_bp, search_bp, feed_bp,
        cache_bp, prefetch_bp, network_bp, storage_bp,
        users_bp, admin_bp, devices_bp, predictions_bp,
    )

    for bp in [
        health_bp, auth_bp, content_bp, analytics_bp,
        sources_bp, jobs_bp, search_bp, feed_bp,
        cache_bp, prefetch_bp, network_bp, storage_bp,
        users_bp, admin_bp, devices_bp, predictions_bp,
    ]:
        app.register_blueprint(bp)

    # ── Middleware ────────────────────────────────────────────────────────────
    from app.middleware import register_middleware
    register_middleware(app)

    # ── JWT callbacks ─────────────────────────────────────────────────────────
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_data):
        from app.utils import error_response
        return error_response("Token has expired.", "TOKEN_EXPIRED", 401)

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        from app.utils import error_response
        return error_response("Invalid token.", "INVALID_TOKEN", 401)

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        from app.utils import error_response
        return error_response("Authentication required.", "MISSING_TOKEN", 401)

    # ── Database setup ────────────────────────────────────────────────────────
    with app.app_context():
        try:
            db.create_all()
            _seed_initial_data()
            # Ensure upload directories exist
            from pathlib import Path
            storage_path = Path(app.config.get("LOCAL_STORAGE_PATH", "uploads"))
            for sub in ["ingested", "thumbnails", "hls", "processed"]:
                (storage_path / sub).mkdir(parents=True, exist_ok=True)
            logger.info("app_started", env=env or os.environ.get("FLASK_ENV", "development"))
        except Exception as e:
            logger.warning("db_init_warning", error=str(e))

    return app


def _seed_initial_data():
    """Seed roles and admin user on first run."""
    from app.services import seed_roles
    from app.models import User, Role
    from app.services.auth_service import hash_password

    seed_roles()

    # Create default admin if none exists
    if not User.query.filter_by(username="admin").first():
        admin_role = Role.query.filter_by(name="admin").first()
        if admin_role:
            admin = User(
                username="admin",
                email="admin@smartflow.local",
                password_hash=hash_password(os.environ.get("ADMIN_PASSWORD", "SmartFlow@2024!")),
                full_name="SmartFlow Admin",
                role_id=admin_role.id,
                is_active=True,
                is_verified=True,
            )
            db.session.add(admin)
            db.session.commit()
            structlog.get_logger().info("admin_user_created", username="admin")

    # Create demo content
    from app.models import Content
    if Content.query.count() == 0:
        _seed_demo_content()


def _seed_demo_content():
    """Seed demo content for demonstration purposes."""
    from app.models import Content, User
    import uuid
    from slugify import slugify

    uploader = User.query.filter_by(username="admin").first()
    if not uploader:
        return

    demo_items = [
        {"title": "SmartFlow Platform Introduction", "content_type": "video", "mime_type": "video/mp4", "size_bytes": 52428800, "duration_seconds": 180.0, "is_public": True, "description": "Introduction to the SmartFlow intelligent content delivery platform."},
        {"title": "Architecture Overview", "content_type": "document", "mime_type": "application/pdf", "size_bytes": 1048576, "is_public": True, "description": "Technical architecture diagram and documentation."},
        {"title": "Performance Benchmarks", "content_type": "document", "mime_type": "application/pdf", "size_bytes": 512000, "is_public": True, "description": "Latency measurements and performance benchmark results."},
        {"title": "Demo Video - Cache in Action", "content_type": "video", "mime_type": "video/mp4", "size_bytes": 104857600, "duration_seconds": 300.0, "is_public": True, "description": "Demonstrates the cache-first and stale-while-revalidate strategies."},
        {"title": "System Architecture Diagram", "content_type": "image", "mime_type": "image/png", "size_bytes": 204800, "width": 1920, "height": 1080, "is_public": True, "description": "High-resolution system architecture overview."},
        {"title": "Prefetch Engine Demo", "content_type": "video", "mime_type": "video/mp4", "size_bytes": 78643200, "duration_seconds": 240.0, "is_public": True, "description": "Demonstrates intelligent prefetching with network awareness."},
    ]

    for item in demo_items:
        slug_base = slugify(item["title"])[:400]
        slug = slug_base
        if Content.query.filter_by(slug=slug).first():
            continue
        c = Content(
            id=str(uuid.uuid4()),
            slug=slug,
            uploaded_by=uploader.id,
            **item,
        )
        db.session.add(c)

    db.session.commit()
    structlog.get_logger().info("demo_content_seeded")
