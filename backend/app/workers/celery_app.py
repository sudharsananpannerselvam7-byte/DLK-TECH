"""
SmartFlow Celery Worker Configuration
Background processing for media, ingestion, and cache operations.
"""
import os
from celery import Celery
import structlog

logger = structlog.get_logger(__name__)


def make_celery(app=None) -> Celery:
    """Create and configure the Celery instance."""
    broker = os.environ.get("CELERY_BROKER_URL", os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
    backend = os.environ.get("CELERY_RESULT_BACKEND", broker)

    celery = Celery(
        "smartflow",
        broker=broker,
        backend=backend,
        include=[
            "app.workers.media_tasks",
            "app.workers.ingestion_tasks",
            "app.workers.cache_tasks",
        ],
    )

    celery.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        task_soft_time_limit=300,
        task_time_limit=600,
        task_routes={
            "app.workers.media_tasks.*": {"queue": "media"},
            "app.workers.ingestion_tasks.*": {"queue": "ingestion"},
            "app.workers.cache_tasks.*": {"queue": "cache"},
        },
    )

    if app is not None:
        class ContextTask(celery.Task):
            def __call__(self, *args, **kwargs):
                with app.app_context():
                    return self.run(*args, **kwargs)

        celery.Task = ContextTask

    return celery


celery_app = make_celery()
