# SmartFlow REST API Specification

All endpoints are versioned under `/api/v1/`.

## Common Response Structure

### Success Response (HTTP 200/201)
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message or null",
  "request_id": "c1f7b0a8-3a9d-4e94-b258-39e2fbfdfd0a",
  "meta": {
    "total": 120,
    "page": 1,
    "per_page": 20,
    "total_pages": 6,
    "has_next": true,
    "has_prev": false
  }
}
```

### Error Response (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "data": null,
  "message": "Human readable error description",
  "error_code": "RESOURCE_NOT_FOUND",
  "request_id": "c1f7b0a8-3a9d-4e94-b258-39e2fbfdfd0a"
}
```

---

## 1. Authentication (`/api/v1/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | Register new user account |
| `POST` | `/api/v1/auth/login` | None | Authenticate credentials, returns JWT tokens |
| `POST` | `/api/v1/auth/refresh` | None | Refresh access token using valid refresh token |
| `POST` | `/api/v1/auth/logout` | Bearer | Invalidate session tokens |
| `GET` | `/api/v1/auth/me` | Bearer | Return authenticated user profile and roles |

---

## 2. Content Operations (`/api/v1/content`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/content` | Optional | Paginated list of content with filters (`type`, `q`, `page`) |
| `POST` | `/api/v1/content/upload` | Bearer | Multipart upload supporting large files with checksum |
| `GET` | `/api/v1/content/{id}` | Optional | Detailed content metadata, specs, and storage key |
| `PATCH` | `/api/v1/content/{id}` | Bearer | Update metadata (title, description, tags, access) |
| `DELETE` | `/api/v1/content/{id}` | Bearer | Remove content item and purge from cache |
| `GET` | `/api/v1/content/{id}/stream` | Optional | Byte-range streaming (`HTTP 206 Partial Content`) |

---

## 3. Feed & Search (`/api/v1/feed`, `/api/v1/search`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/feed` | Optional | Cursor-paginated smart feed with prefetch metadata |
| `GET` | `/api/v1/search` | Optional | Fast indexed search over titles, tags, and MIME types |

---

## 4. Cache & Prefetch Controls (`/api/v1/cache`, `/api/v1/prefetch`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/cache/status` | Optional | Cluster cache statistics and hit ratios |
| `POST` | `/api/v1/cache/warm/{id}` | Optional | Pre-warm Redis and edge cache for a content item |
| `POST` | `/api/v1/cache/invalidate/{id}` | Bearer | Invalidate cache entry across all tiers |
| `POST` | `/api/v1/prefetch` | Optional | Submit batch prefetch intent with network quality hints |
| `GET` | `/api/v1/prefetch/status` | Optional | Check pre-warming status for specific IDs |

---

## 5. Network Telemetry (`/api/v1/network`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/network/report` | Optional | Client telemetry ping (RTT, downlink bandwidth, online state) |
| `GET` | `/api/v1/network/stats` | Optional | Aggregate network conditions across connected clients |

---

## 6. Background Jobs (`/api/v1/jobs`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/jobs` | Optional | List processing jobs with filter (`status`, `page`) |
| `GET` | `/api/v1/jobs/{id}` | Optional | Detailed job execution progress and logs |
| `POST` | `/api/v1/jobs/{id}/cancel` | Bearer | Abort active processing task |
| `POST` | `/api/v1/jobs/{id}/retry` | Bearer | Requeue failed processing task |

---

## 7. Source Adapters (`/api/v1/sources`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/sources` | Bearer | List configured content sources |
| `POST` | `/api/v1/sources` | Bearer | Register new authorized storage adapter |
| `POST` | `/api/v1/sources/{id}/sync` | Bearer | Trigger synchronization and metadata ingestion |
| `DELETE` | `/api/v1/sources/{id}` | Bearer | Remove source adapter |

---

## 8. Analytics & Admin (`/api/v1/analytics`, `/api/v1/admin`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/analytics/overview` | Optional | System-wide statistics and operational metrics |
| `GET` | `/api/v1/analytics/latency` | Optional | Latency percentiles (P50, P95, P99, average) |
| `GET` | `/api/v1/analytics/cache` | Optional | Multi-tier cache hit, miss, and eviction rates |
| `GET` | `/api/v1/analytics/prefetch` | Optional | Prefetch conversion and consumption rates |
| `GET` | `/api/v1/admin/dashboard` | Admin | SuperAdmin overview metrics and health |
| `GET` | `/api/v1/admin/audit-logs` | Admin | Audit trail of security and configuration events |
| `GET` | `/api/v1/health` | None | Operational liveness & readiness check |
