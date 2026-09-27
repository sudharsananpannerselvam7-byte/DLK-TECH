# SmartFlow Cloud Connectors Architecture

SmartFlow provides an extensible adapter interface (`BaseSourceConnector` / `ContentSourceAdapter`) that allows connecting heterogeneous remote data sources without altering the core indexing, prefetching, or caching subsystems.

---

## 1. Unified Connector Contract

Every source connector implements:
- `connect(credentials) -> bool`: Establishes session/handshake.
- `disconnect()`: Revokes active session tokens.
- `list_resources(cursor, limit) -> List[Resource]`: Enumerates available resources.
- `get_metadata(resource_id) -> Dict`: Fetches remote sizes, hashes, and MIME types.
- `stream(resource_id, byte_range) -> Generator`: Emits chunked byte streams for range queries (RFC 7233).
- `check_changes(since_timestamp) -> List[ChangeRecord]`: Polls for remote mutations.

---

## 2. Implemented Adapters

### LocalAdapter (`backend/app/integrations/adapters/local_adapter.py`)
- Reads authorized local folders.
- Strict path canonicalization prevents path traversal outside the approved directory tree.

### GoogleDriveAdapter (`backend/app/integrations/adapters/google_drive_adapter.py`)
- Connects to Google Drive v3 REST API using OAuth 2.0 PKCE.
- Respects read-only scopes and remote permissions.

### GitHubAdapter (`backend/app/integrations/adapters/github_adapter.py`)
- Interfaces with GitHub REST API v3 / Git trees.
- Validates commit SHAs to avoid redundant fetches.
