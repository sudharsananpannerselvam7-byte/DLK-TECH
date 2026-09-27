# SmartFlow Database Architecture & Migrations

## Overview

SmartFlow uses PostgreSQL as its primary relational store for metadata, identity, telemetry, and audit logs. Large binary streams and media files are strictly stored in Object Storage; PostgreSQL stores only pointer keys, checksums, and technical metadata.

---

## 1. Normalized Schema Definition

### 1.1 `users` & `roles`
- `id` (UUID, Primary Key)
- `username` (VARCHAR 80, Unique, Indexed)
- `email` (VARCHAR 255, Unique, Indexed)
- `password_hash` (VARCHAR 255, Scrypt/Bcrypt)
- `role` (VARCHAR 20: `admin`, `manager`, `user`, `viewer`)
- `is_active` (BOOLEAN, Default True)
- `created_at`, `updated_at`, `last_login_at`

### 1.2 `content`
- `id` (UUID, Primary Key)
- `title` (VARCHAR 255, Indexed)
- `slug` (VARCHAR 255, Unique, Indexed)
- `description` (TEXT)
- `content_type` (VARCHAR 30: `video`, `image`, `document`, `audio`, etc.)
- `mime_type` (VARCHAR 100)
- `storage_path` (VARCHAR 500)
- `size_bytes` (BIGINT)
- `checksum` (VARCHAR 64, SHA-256)
- `etag` (VARCHAR 64)
- `duration_seconds` (FLOAT, Nullable)
- `width`, `height` (INTEGER, Nullable)
- `bitrate` (INTEGER, Nullable)
- `is_optimized` (BOOLEAN, Default False)
- `is_public` (BOOLEAN, Default True)
- `view_count` (BIGINT, Default 0)
- `source_id` (UUID, Foreign Key to `content_sources.id`)
- `owner_id` (UUID, Foreign Key to `users.id`)
- `created_at`, `updated_at`, `deleted_at` (Soft Delete)

### 1.3 `content_versions`
- `id` (UUID, Primary Key)
- `content_id` (UUID, Foreign Key)
- `quality_label` (VARCHAR 30: `1080p`, `720p`, `480p`, `thumbnail`)
- `storage_key` (VARCHAR 500)
- `is_hls` (BOOLEAN)
- `size_bytes` (BIGINT)

### 1.4 `content_sources`
- `id` (UUID, Primary Key)
- `name` (VARCHAR 100)
- `adapter_type` (VARCHAR 50: `local`, `s3`, `google_drive`, `api`)
- `config` (JSONB)
- `is_active` (BOOLEAN)
- `last_synced_at` (TIMESTAMP)

### 1.5 `processing_jobs` & `processing_events`
- `id` (UUID, Primary Key)
- `content_id` (UUID, Nullable)
- `job_type` (VARCHAR 50: `transcode`, `metadata_extract`, `sync`, `thumbnail`)
- `status` (VARCHAR 30: `pending`, `queued`, `processing`, `completed`, `failed`, `cancelled`)
- `progress` (INTEGER, 0-100)
- `error_message` (TEXT)
- `retry_count` (INTEGER)
- `started_at`, `completed_at`

### 1.6 `latency_metrics` & `network_metrics`
- Stores time-series latency events with query optimizations:
- Indexed on `(recorded_at, metric_type)` for rapid percentile computation (`P50`, `P95`, `P99`).

---

## 2. Migration Management

Database migrations are managed via **Flask-Migrate** (Alembic):
- Migration directory: `backend/migrations`
- Run migrations: `flask db upgrade`
- Create migration: `flask db migrate -m "migration_name"`
