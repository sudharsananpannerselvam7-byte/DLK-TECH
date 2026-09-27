"""
SmartFlow Database Models
All production database tables with proper indexes, constraints, and relationships.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey,
    Index, Integer, String, Text, BigInteger, JSON, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func

from app.extensions import db


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    """Adds created_at and updated_at to any model."""
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SoftDeleteMixin:
    """Adds soft-delete capability."""
    deleted_at = Column(DateTime(timezone=True), nullable=True, default=None)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def soft_delete(self):
        self.deleted_at = utcnow()


# ─────────────────────────────────────────────────────────────────────────────
# ROLES & USERS
# ─────────────────────────────────────────────────────────────────────────────

class Role(db.Model, TimestampMixin):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    permissions = Column(JSON, nullable=False, default=dict)

    users = relationship("User", back_populates="role")

    def __repr__(self):
        return f"<Role {self.name}>"


class User(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False, default=4)  # Viewer by default
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    preferences = Column(JSON, nullable=False, default=dict)

    role = relationship("Role", back_populates="users")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    activity = relationship("UserActivity", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")

    __table_args__ = (
        Index("idx_users_email_active", "email", "is_active"),
        Index("idx_users_deleted_at", "deleted_at"),
    )

    def __repr__(self):
        return f"<User {self.username}>"


class UserSession(db.Model, TimestampMixin):
    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index("idx_sessions_user_id", "user_id"),
        Index("idx_sessions_expires", "expires_at"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CONTENT SOURCES
# ─────────────────────────────────────────────────────────────────────────────

class ContentSource(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "content_sources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    adapter_type = Column(
        Enum("google_drive", "s3", "local", "api", "minio", name="adapter_type_enum"),
        nullable=False
    )
    config = Column(JSON, nullable=False, default=dict)  # Encrypted in production
    is_active = Column(Boolean, default=True, nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    sync_interval_minutes = Column(Integer, default=60, nullable=False)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    metadata_ = Column("metadata", JSON, nullable=False, default=dict)

    owner = relationship("User")
    source_items = relationship("SourceItem", back_populates="source", cascade="all, delete-orphan")
    content = relationship("Content", back_populates="source")

    __table_args__ = (
        Index("idx_sources_owner", "owner_id"),
        Index("idx_sources_type", "adapter_type"),
    )


class SourceItem(db.Model, TimestampMixin):
    __tablename__ = "source_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_id = Column(String(36), ForeignKey("content_sources.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String(500), nullable=False)  # ID in external system
    name = Column(String(500), nullable=False)
    mime_type = Column(String(200), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    checksum = Column(String(64), nullable=True)
    etag = Column(String(255), nullable=True)
    external_modified_at = Column(DateTime(timezone=True), nullable=True)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    is_processed = Column(Boolean, default=False, nullable=False)
    processing_error = Column(Text, nullable=True)

    source = relationship("ContentSource", back_populates="source_items")
    content = relationship("Content", back_populates="source_item", uselist=False)

    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_source_item"),
        Index("idx_source_items_source", "source_id"),
        Index("idx_source_items_processed", "is_processed"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CONTENT
# ─────────────────────────────────────────────────────────────────────────────

class Content(db.Model, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "content"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    content_type = Column(
        Enum("video", "image", "document", "audio", "archive", "data", "other", name="content_type_enum"),
        nullable=False, default="other"
    )
    mime_type = Column(String(200), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    duration_seconds = Column(Float, nullable=True)  # For audio/video
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    thumbnail_url = Column(String(1000), nullable=True)
    slug = Column(String(600), unique=True, nullable=False)
    tags = Column(JSON, nullable=False, default=list)
    metadata_ = Column("metadata", JSON, nullable=False, default=dict)

    # Relationships
    source_id = Column(String(36), ForeignKey("content_sources.id"), nullable=True)
    source_item_id = Column(String(36), ForeignKey("source_items.id"), nullable=True)
    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    is_public = Column(Boolean, default=False, nullable=False)
    is_indexed = Column(Boolean, default=False, nullable=False)
    view_count = Column(BigInteger, default=0, nullable=False)

    source = relationship("ContentSource", back_populates="content")
    source_item = relationship("SourceItem", back_populates="content")
    uploader = relationship("User")
    versions = relationship("ContentVersion", back_populates="content", cascade="all, delete-orphan")
    storage_objects = relationship("StorageObject", back_populates="content", cascade="all, delete-orphan")
    processing_jobs = relationship("ProcessingJob", back_populates="content")

    __table_args__ = (
        Index("idx_content_type", "content_type"),
        Index("idx_content_source", "source_id"),
        Index("idx_content_public", "is_public"),
        Index("idx_content_indexed", "is_indexed"),
        Index("idx_content_deleted", "deleted_at"),
        Index("idx_content_slug", "slug"),
    )


class ContentVersion(db.Model, TimestampMixin):
    __tablename__ = "content_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    content_id = Column(String(36), ForeignKey("content.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False, default=1)
    quality_label = Column(String(50), nullable=True)  # "1080p", "720p", "original"
    codec = Column(String(100), nullable=True)
    bitrate = Column(Integer, nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    storage_key = Column(String(1000), nullable=False)
    manifest_key = Column(String(1000), nullable=True)  # HLS manifest
    is_original = Column(Boolean, default=False, nullable=False)
    is_hls = Column(Boolean, default=False, nullable=False)
    checksum = Column(String(64), nullable=True)
    metadata_ = Column("metadata", JSON, nullable=False, default=dict)

    content = relationship("Content", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("content_id", "quality_label", name="uq_content_version_quality"),
        Index("idx_versions_content", "content_id"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# STORAGE
# ─────────────────────────────────────────────────────────────────────────────

class StorageObject(db.Model, TimestampMixin):
    __tablename__ = "storage_objects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    content_id = Column(String(36), ForeignKey("content.id", ondelete="CASCADE"), nullable=True)
    object_key = Column(String(1000), nullable=False, unique=True)
    bucket = Column(String(255), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(200), nullable=True)
    checksum = Column(String(64), nullable=True)
    etag = Column(String(255), nullable=True)
    storage_version = Column(String(100), nullable=True)
    metadata_ = Column("metadata", JSON, nullable=False, default=dict)
    is_public = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    content = relationship("Content", back_populates="storage_objects")

    __table_args__ = (
        Index("idx_storage_content", "content_id"),
        Index("idx_storage_bucket_key", "bucket", "object_key"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# PROCESSING JOBS
# ─────────────────────────────────────────────────────────────────────────────

class ProcessingJob(db.Model, TimestampMixin):
    __tablename__ = "processing_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    content_id = Column(String(36), ForeignKey("content.id"), nullable=True)
    source_item_id = Column(String(36), ForeignKey("source_items.id"), nullable=True)
    job_type = Column(
        Enum(
            "ingest", "transcode", "thumbnail", "hls", "metadata_extract",
            "optimize", "index", "cache_warm", "sync", "cleanup",
            name="job_type_enum"
        ),
        nullable=False
    )
    status = Column(
        Enum("pending", "queued", "processing", "completed", "failed", "cancelled", name="job_status_enum"),
        nullable=False, default="pending"
    )
    progress = Column(Float, default=0.0, nullable=False)
    priority = Column(Integer, default=5, nullable=False)
    celery_task_id = Column(String(255), nullable=True, index=True)
    input_data = Column(JSON, nullable=False, default=dict)
    output_data = Column(JSON, nullable=False, default=dict)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    max_retries = Column(Integer, default=3, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    content = relationship("Content", back_populates="processing_jobs")
    events = relationship("ProcessingEvent", back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_jobs_status", "status"),
        Index("idx_jobs_content", "content_id"),
        Index("idx_jobs_type_status", "job_type", "status"),
    )


class ProcessingEvent(db.Model, TimestampMixin):
    __tablename__ = "processing_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    job_id = Column(String(36), ForeignKey("processing_jobs.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(100), nullable=False)
    message = Column(Text, nullable=True)
    data = Column(JSON, nullable=False, default=dict)

    job = relationship("ProcessingJob", back_populates="events")

    __table_args__ = (
        Index("idx_events_job", "job_id"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CACHE & PREFETCH
# ─────────────────────────────────────────────────────────────────────────────

class CacheEntry(db.Model, TimestampMixin):
    __tablename__ = "cache_entries"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    cache_key = Column(String(500), nullable=False, unique=True, index=True)
    cache_version = Column(String(50), nullable=False)
    content_id = Column(String(36), nullable=True)
    hit_count = Column(BigInteger, default=0, nullable=False)
    miss_count = Column(BigInteger, default=0, nullable=False)
    size_bytes = Column(BigInteger, nullable=True)
    ttl_seconds = Column(Integer, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    last_hit_at = Column(DateTime(timezone=True), nullable=True)
    strategy = Column(String(50), nullable=True)  # cache-first, stale-while-revalidate, etc.
    is_stale = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        Index("idx_cache_expires", "expires_at"),
        Index("idx_cache_content", "content_id"),
    )


class PrefetchJob(db.Model, TimestampMixin):
    __tablename__ = "prefetch_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    content_id = Column(String(36), ForeignKey("content.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    status = Column(
        Enum("pending", "prefetching", "ready", "expired", "failed", name="prefetch_status_enum"),
        nullable=False, default="pending"
    )
    priority = Column(Integer, default=5, nullable=False)
    hit_count = Column(Integer, default=0, nullable=False)  # Times served from prefetch
    was_used = Column(Boolean, default=False, nullable=False)
    network_quality = Column(String(20), nullable=True)  # fast/medium/slow
    expires_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_prefetch_content", "content_id"),
        Index("idx_prefetch_status", "status"),
        Index("idx_prefetch_user", "user_id"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# ANALYTICS & MONITORING
# ─────────────────────────────────────────────────────────────────────────────

class UserActivity(db.Model, TimestampMixin):
    __tablename__ = "user_activity"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content_id = Column(String(36), ForeignKey("content.id"), nullable=True)
    activity_type = Column(
        Enum("view", "play", "pause", "seek", "download", "search", "share", name="activity_type_enum"),
        nullable=False
    )
    duration_ms = Column(Integer, nullable=True)
    metadata_ = Column("metadata", JSON, nullable=False, default=dict)

    user = relationship("User", back_populates="activity")

    __table_args__ = (
        Index("idx_activity_user", "user_id"),
        Index("idx_activity_content", "content_id"),
        Index("idx_activity_type", "activity_type"),
    )


class LatencyMetric(db.Model):
    __tablename__ = "latency_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    endpoint = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer, nullable=True)
    latency_ms = Column(Float, nullable=False)
    cache_result = Column(
        Enum("hit", "miss", "prefetch_hit", "offline_hit", "none", name="cache_result_enum"),
        nullable=True
    )
    user_id = Column(String(36), nullable=True)
    request_id = Column(String(36), nullable=True)
    content_id = Column(String(36), nullable=True)
    backend_ms = Column(Float, nullable=True)
    db_ms = Column(Float, nullable=True)
    network_quality = Column(String(20), nullable=True)

    __table_args__ = (
        Index("idx_latency_endpoint", "endpoint"),
        Index("idx_latency_recorded", "recorded_at"),
        Index("idx_latency_cache", "cache_result"),
    )


class NetworkMetric(db.Model):
    __tablename__ = "network_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    user_id = Column(String(36), nullable=True)
    rtt_ms = Column(Float, nullable=True)
    bandwidth_mbps = Column(Float, nullable=True)
    quality = Column(String(20), nullable=True)  # fast/medium/slow/offline
    is_online = Column(Boolean, nullable=True)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(36), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    details = Column(JSON, nullable=False, default=dict)
    success = Column(Boolean, nullable=False, default=True)

    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("idx_audit_user", "user_id"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_recorded", "recorded_at"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# DESKTOP DEVICES & PREDICTIVE TRANSITIONS
# ─────────────────────────────────────────────────────────────────────────────

class Device(db.Model, TimestampMixin):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_name = Column(String(100), nullable=False)
    device_type = Column(String(50), nullable=False, default="desktop")
    client_version = Column(String(50), nullable=False, default="1.0.0")
    device_fingerprint = Column(String(255), nullable=False, unique=True, index=True)
    is_authorized = Column(Boolean, nullable=False, default=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    ip_address = Column(String(45), nullable=True)
    system_info = Column(JSON, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="offline")

    user = relationship("User", backref=backref("devices", cascade="all, delete-orphan"))

    __table_args__ = (
        Index("idx_device_user", "user_id"),
        Index("idx_device_status", "status"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "device_name": self.device_name,
            "device_type": self.device_type,
            "client_version": self.client_version,
            "device_fingerprint": self.device_fingerprint,
            "is_authorized": self.is_authorized,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "ip_address": self.ip_address,
            "system_info": self.system_info,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PredictionEvent(db.Model, TimestampMixin):
    __tablename__ = "prediction_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    current_resource_id = Column(String(100), nullable=False, index=True)
    predicted_resource_id = Column(String(100), nullable=False, index=True)
    prediction_score = Column(Float, nullable=False, default=0.5)
    reason = Column(String(255), nullable=False)
    prefetch_status = Column(String(30), nullable=False, default="queued")
    latency_saved_ms = Column(Float, nullable=True, default=0.0)

    user = relationship("User", backref=backref("predictions", cascade="all, delete-orphan"))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "current_resource_id": self.current_resource_id,
            "predicted_resource_id": self.predicted_resource_id,
            "prediction_score": round(self.prediction_score, 2),
            "reason": self.reason,
            "prefetch_status": self.prefetch_status,
            "latency_saved_ms": self.latency_saved_ms,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ResourceTransition(db.Model, TimestampMixin):
    __tablename__ = "resource_transitions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    from_resource_id = Column(String(100), nullable=False)
    to_resource_id = Column(String(100), nullable=False)
    transition_count = Column(Integer, nullable=False, default=1)
    last_transition_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "from_resource_id", "to_resource_id", name="uq_user_resource_transition"),
        Index("idx_transition_lookup", "user_id", "from_resource_id"),
    )

