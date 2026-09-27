# SmartFlow Large-File Handling Architecture

## 1. Zero Full-Memory Buffering

The system is designed for 10MB, 100MB, 1GB, 10GB, and 100GB+ files:
- **No `request.get_data()` in memory**: Large files are never read entirely into Flask process memory.
- Python generators stream data in bounded 64KB - 1MB chunk buffers.
- Maximum RAM usage per streaming worker remains bounded (&lt; 50MB regardless of file size).

---

## 2. Byte-Range Streaming (`HTTP 206 Partial Content`)

Media streams implement RFC 7233 range requests:
```http
GET /api/v1/content/b248a.../stream HTTP/1.1
Range: bytes=1048576-2097151

HTTP/1.1 206 Partial Content
Content-Range: bytes 1048576-2097151/524288000
Content-Length: 1048576
Content-Type: video/mp4
Accept-Ranges: bytes
```
This enables:
- Instant video scrub/seek without downloading earlier portions.
- Resumable transfers on interrupted mobile connections.

---

## 3. Checksum Verification

- Streaming transfers compute SHA-256 and MD5/ETag on the fly using rolling hashers.
- Ingestion verifies storage object integrity before registering metadata in PostgreSQL.
