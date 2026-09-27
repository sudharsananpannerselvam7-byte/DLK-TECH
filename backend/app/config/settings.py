"""
SmartFlow Configuration Management
Loads from environment variables with sensible defaults for development.
Production MUST override all secrets and URLs via environment variables.
"""
import os
import secrets
from datetime import timedelta
from typing import Optional


def _env(key: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    """Load an environment variable, optionally raising if required."""
    value = os.environ.get(key, default)
    if required and not value:
        raise RuntimeError(f"Required environment variable '{key}' is not set.")
    return value


class BaseConfig:
    # ─── Core ───────────────────────────────────────────────────────────
    SECRET_KEY: str = _env("SECRET_KEY", secrets.token_hex(32))
    JWT_SECRET_KEY: str = _env("JWT_SECRET_KEY", secrets.token_hex(32))
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    JWT_ALGORITHM = "HS256"

    # ─── Database ────────────────────────────────────────────────────────
    DATABASE_URL: str = _env(
        "DATABASE_URL",
        "sqlite:///smartflow_dev.db"
    )
    SQLALCHEMY_DATABASE_URI: str = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
    }

    # ─── Redis ───────────────────────────────────────────────────────────
    REDIS_URL: str = _env("REDIS_URL", "redis://localhost:6379/0")
    CACHE_TYPE = "redis"
    CACHE_REDIS_URL: str = REDIS_URL
    CACHE_DEFAULT_TIMEOUT: int = int(_env("CACHE_TTL", "300"))
    USE_FAKE_REDIS: bool = _env("USE_FAKE_REDIS", "false").lower() == "true"

    # ─── Celery ──────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = _env("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND: str = _env("CELERY_RESULT_BACKEND", REDIS_URL)
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TIMEZONE = "UTC"
    WORKER_CONCURRENCY: int = int(_env("WORKER_CONCURRENCY", "4"))

    # ─── CORS ────────────────────────────────────────────────────────────
    CORS_ORIGINS: list = _env("CORS_ORIGINS", "http://localhost:3000").split(",")

    # ─── Object Storage (MinIO / S3-compatible) ──────────────────────────
    STORAGE_ENDPOINT: str = _env("STORAGE_ENDPOINT", "localhost:9000")
    STORAGE_ACCESS_KEY: str = _env("STORAGE_ACCESS_KEY", "minioadmin")
    STORAGE_SECRET_KEY: str = _env("STORAGE_SECRET_KEY", "minioadmin")
    STORAGE_BUCKET: str = _env("STORAGE_BUCKET", "smartflow")
    STORAGE_SECURE: bool = _env("STORAGE_SECURE", "false").lower() == "true"
    STORAGE_URL: str = _env("STORAGE_URL", f"http://localhost:9000")
    USE_LOCAL_STORAGE: bool = _env("USE_LOCAL_STORAGE", "true").lower() == "true"
    LOCAL_STORAGE_PATH: str = _env("LOCAL_STORAGE_PATH", "uploads")

    # ─── Google Drive ────────────────────────────────────────────────────
    GOOGLE_DRIVE_FOLDER_ID: Optional[str] = _env("GOOGLE_DRIVE_FOLDER_ID")
    GOOGLE_SERVICE_ACCOUNT_JSON: Optional[str] = _env("GOOGLE_SERVICE_ACCOUNT_JSON")

    # ─── Rate Limiting ───────────────────────────────────────────────────
    RATELIMIT_STORAGE_URL: str = REDIS_URL
    RATELIMIT_DEFAULT = "200 per day, 50 per hour"
    RATELIMIT_STRATEGY = "fixed-window"

    # ─── Content Limits ──────────────────────────────────────────────────
    MAX_CONTENT_LENGTH: int = int(_env("MAX_FILE_SIZE", str(10 * 1024 * 1024 * 1024)))  # 10GB
    PREFETCH_LIMIT: int = int(_env("PREFETCH_LIMIT", "5"))
    MAX_PREFETCH_CONCURRENT: int = int(_env("MAX_PREFETCH_CONCURRENT", "3"))
    CACHE_TTL: int = int(_env("CACHE_TTL", "300"))
    CONTENT_CACHE_TTL: int = int(_env("CONTENT_CACHE_TTL", "3600"))
    METADATA_CACHE_TTL: int = int(_env("METADATA_CACHE_TTL", "600"))

    # ─── Security ────────────────────────────────────────────────────────
    BCRYPT_LOG_ROUNDS: int = 12
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    SESSION_COOKIE_SECURE: bool = False
    SESSION_COOKIE_HTTPONLY: bool = True
    SESSION_COOKIE_SAMESITE: str = "Lax"
    WTF_CSRF_ENABLED: bool = True

    # ─── Media Processing ────────────────────────────────────────────────
    FFMPEG_PATH: str = _env("FFMPEG_PATH", "ffmpeg")
    FFPROBE_PATH: str = _env("FFPROBE_PATH", "ffprobe")
    HLS_SEGMENT_DURATION: int = int(_env("HLS_SEGMENT_DURATION", "6"))
    VIDEO_QUALITIES = [(1920, 1080, "1080p"), (1280, 720, "720p"), (854, 480, "480p"), (640, 360, "360p")]

    # ─── Logging ─────────────────────────────────────────────────────────
    LOG_LEVEL: str = _env("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = "json"

    # ─── App ─────────────────────────────────────────────────────────────
    DEBUG: bool = False
    TESTING: bool = False
    API_VERSION: str = "v1"
    APP_NAME: str = "SmartFlow"


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    BCRYPT_LOG_ROUNDS = 4  # Faster in dev
    SQLALCHEMY_ECHO = False
    USE_FAKE_REDIS: bool = _env("USE_FAKE_REDIS", "true").lower() == "true"
    SESSION_COOKIE_SECURE = False


class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    USE_FAKE_REDIS = True
    WTF_CSRF_ENABLED = False
    BCRYPT_LOG_ROUNDS = 4
    RATELIMIT_ENABLED = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "Strict"
    USE_FAKE_REDIS = False
    BCRYPT_LOG_ROUNDS = 13
    SQLALCHEMY_ECHO = False

    def __init__(self):
        # In production, verify required vars are present
        if not os.environ.get("SECRET_KEY"):
            import warnings
            warnings.warn("SECRET_KEY not set in production environment!", RuntimeWarning)
        if not os.environ.get("JWT_SECRET_KEY"):
            import warnings
            warnings.warn("JWT_SECRET_KEY not set in production environment!", RuntimeWarning)


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}


def get_config(env: Optional[str] = None) -> BaseConfig:
    env = env or os.environ.get("FLASK_ENV", "development")
    config_class = CONFIG_MAP.get(env, DevelopmentConfig)
    return config_class()
