"""
SmartFlow Ingestion Tasks
Discovers and ingests content from configured sources.
Prevents duplicate processing via ETag/checksum comparison.
"""
import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog

from app.workers.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task(
    name="app.workers.ingestion_tasks.sync_source",
    bind=True,
    max_retries=3,
    default_retry_delay=120,
)
def sync_source(self, source_id: str, force: bool = False):
    """
    Sync all content from a source.
    Detects new items and changed items; skips unchanged items.
    """
    from app.extensions import db
    from app.models import ContentSource, SourceItem, ProcessingJob
    from app.integrations.adapters import get_adapter

    logger.info("source_sync_started", source_id=source_id)

    try:
        source = ContentSource.query.get(source_id)
        if not source or not source.is_active:
            logger.warning("source_not_found_or_inactive", source_id=source_id)
            return

        adapter = get_adapter(source.adapter_type, source.config)
        if not adapter.test_connection():
            raise ConnectionError(f"Cannot connect to source {source.name}")

        page_token = None
        total_new = 0
        total_updated = 0
        total_skipped = 0

        while True:
            items, next_token = adapter.list_content(page_token=page_token, limit=100)
            if not items:
                break

            for meta in items:
                existing = SourceItem.query.filter_by(
                    source_id=source_id,
                    external_id=meta.external_id,
                ).first()

                if existing:
                    # Check if changed
                    needs_reprocess = False
                    if meta.etag and meta.etag != existing.etag:
                        needs_reprocess = True
                    elif meta.modified_at and (
                        not existing.external_modified_at or
                        meta.modified_at > existing.external_modified_at
                    ):
                        needs_reprocess = True

                    if not needs_reprocess and not force:
                        total_skipped += 1
                        continue

                    # Update existing item
                    existing.name = meta.name
                    existing.mime_type = meta.mime_type
                    existing.size_bytes = meta.size_bytes
                    existing.checksum = meta.checksum
                    existing.etag = meta.etag
                    existing.external_modified_at = meta.modified_at
                    existing.is_processed = False
                    existing.processing_error = None
                    db.session.commit()
                    total_updated += 1

                    # Queue reprocessing
                    ingest_item.delay(source_id=source_id, source_item_id=existing.id)
                else:
                    # New item
                    item = SourceItem(
                        source_id=source_id,
                        external_id=meta.external_id,
                        name=meta.name,
                        mime_type=meta.mime_type,
                        size_bytes=meta.size_bytes,
                        checksum=meta.checksum,
                        etag=meta.etag,
                        external_modified_at=meta.modified_at,
                        is_processed=False,
                    )
                    db.session.add(item)
                    db.session.commit()
                    total_new += 1

                    # Queue ingestion
                    ingest_item.delay(source_id=source_id, source_item_id=item.id)

            page_token = next_token
            if not next_token:
                break

        source.last_synced_at = datetime.now(timezone.utc)
        db.session.commit()

        logger.info(
            "source_sync_complete",
            source_id=source_id,
            new=total_new,
            updated=total_updated,
            skipped=total_skipped,
        )

    except Exception as exc:
        logger.exception("source_sync_failed", source_id=source_id, error=str(exc))
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(
    name="app.workers.ingestion_tasks.ingest_item",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def ingest_item(self, source_id: str, source_item_id: str):
    """
    Download and ingest a single source item.
    Streams to local storage without loading into memory.
    Queues media processing after ingestion.
    """
    from app.extensions import db
    from app.models import ContentSource, SourceItem, Content, ProcessingJob, StorageObject
    from app.integrations.adapters import get_adapter
    from app.workers.media_tasks import process_video, extract_image_metadata
    from slugify import slugify
    import uuid

    logger.info("ingestion_started", item_id=source_item_id)

    UPLOAD_DIR = Path("uploads/ingested")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    try:
        item = SourceItem.query.get(source_item_id)
        if not item:
            return

        source = ContentSource.query.get(source_id)
        if not source:
            return

        adapter = get_adapter(source.adapter_type, source.config)
        content_type = _detect_content_type(item.mime_type)

        # Create or find existing Content record
        content = Content.query.filter_by(source_item_id=item.id).first()
        if not content:
            slug_base = slugify(item.name)[:400]
            slug = slug_base
            counter = 0
            while Content.query.filter_by(slug=slug).first():
                counter += 1
                slug = f"{slug_base}-{counter}"

            content = Content(
                title=item.name,
                content_type=content_type,
                mime_type=item.mime_type,
                size_bytes=item.size_bytes,
                slug=slug,
                source_id=source_id,
                source_item_id=item.id,
                is_indexed=False,
                is_public=False,
            )
            db.session.add(content)
            db.session.flush()

        # Stream content to local storage
        dest_path = UPLOAD_DIR / f"{content.id}{_ext_from_mime(item.mime_type)}"

        logger.info("streaming_content", item_id=source_item_id, dest=str(dest_path))
        bytes_written = 0
        hasher = hashlib.md5()

        with open(dest_path, "wb") as f:
            for chunk in adapter.stream_content(item.external_id):
                f.write(chunk)
                hasher.update(chunk)
                bytes_written += len(chunk)

        checksum = hasher.hexdigest()
        content.size_bytes = bytes_written

        # Create StorageObject record
        storage_obj = StorageObject(
            content_id=content.id,
            object_key=f"ingested/{content.id}{_ext_from_mime(item.mime_type)}",
            bucket="local",
            size_bytes=bytes_written,
            mime_type=item.mime_type,
            checksum=checksum,
        )
        db.session.add(storage_obj)

        # Mark item as processed
        item.is_processed = True
        item.checksum = checksum
        db.session.commit()

        # Queue media-specific processing
        if content_type == "video":
            job = ProcessingJob(
                content_id=content.id,
                source_item_id=item.id,
                job_type="transcode",
                status="queued",
                input_data={"source_path": str(dest_path)},
            )
            db.session.add(job)
            db.session.commit()
            process_video.delay(job.id, content.id, str(dest_path))
        elif content_type == "image":
            job = ProcessingJob(
                content_id=content.id,
                source_item_id=item.id,
                job_type="thumbnail",
                status="queued",
                input_data={"source_path": str(dest_path)},
            )
            db.session.add(job)
            db.session.commit()
            extract_image_metadata.delay(job.id, content.id, str(dest_path))

        logger.info("ingestion_complete", item_id=source_item_id, content_id=content.id)

    except Exception as exc:
        logger.exception("ingestion_failed", item_id=source_item_id, error=str(exc))
        try:
            from app.extensions import db
            from app.models import SourceItem
            item = SourceItem.query.get(source_item_id)
            if item:
                item.processing_error = str(exc)[:500]
                db.session.commit()
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=60)


def _detect_content_type(mime_type: Optional[str]) -> str:
    if not mime_type:
        return "other"
    if mime_type.startswith("video/"):
        return "video"
    if mime_type.startswith("image/"):
        return "image"
    if mime_type.startswith("audio/"):
        return "audio"
    if mime_type in ("application/pdf", "application/msword", "text/plain"):
        return "document"
    return "other"


def _ext_from_mime(mime_type: Optional[str]) -> str:
    import mimetypes
    if not mime_type:
        return ".bin"
    ext = mimetypes.guess_extension(mime_type)
    return ext or ".bin"
