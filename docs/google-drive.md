# Google Drive Integration

SmartFlow integrates with Google Drive via the official Google Drive v3 REST API.

## 1. Authentication & OAuth 2.0 PKCE
- Client initiates OAuth 2.0 flow with standard consent screen.
- Scopes:
  - `https://www.googleapis.com/auth/drive.readonly`
  - `https://www.googleapis.com/auth/drive.metadata.readonly`
- Tokens are encrypted at rest using AES-256 before persistence in PostgreSQL.

## 2. Capabilities
- Hierarchical folder and file metadata cataloging.
- Incremental change tracking via Google Drive Changes API.
- Byte-range chunked downloads for media prefetching.
- Zero DRM or permission bypass: only explicitly shared/accessible items are indexable.
