# SmartFlow Security Specification

## 1. Authentication & Authorization

- **Password Hashing**: Werkzeug scrypt/bcrypt key derivation with per-user salt.
- **JWT Architecture**:
  - Short-lived Access Token (15m expiry) in Bearer header.
  - Revocable Refresh Token (30d expiry) stored in database with blacklisting.
- **Role-Based Access Control (RBAC)**:
  - `Admin`: Full cluster management, source configurations, audit logs, cache purging.
  - `Manager`: Source sync, content curation, job management.
  - `User`: Upload, stream, prefetch, read public/assigned assets.
  - `Viewer`: Read-only streaming access.

---

## 2. Server-Side Request Forgery (SSRF) Protection

For source adapters fetching remote endpoints:
- Blocks `localhost`, `127.0.0.1`, `::1`, and private IP CIDRs (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254` AWS/cloud metadata).
- Restricts protocols strictly to `http://` and `https://`.

---

## 3. Storage & Path Traversal Prevention

- User-submitted filenames are sanitized using `secure_filename`.
- Storage keys use cryptographically random UUIDs (`uuid.uuid4()`) to prevent directory traversal (`../../etc/passwd`).
- No source credentials (Google service account keys, S3 secrets) are ever returned over the API or exposed to frontend code.

---

## 4. Rate Limiting & DoS Protection

- Redis token bucket and sliding window rate limiters protect auth endpoints, search, and uploads.
- Request timeout thresholds prevent slowloris connection-exhaustion attacks.
