# SmartFlow Desktop Local Agent Architecture

The SmartFlow Local Agent operates as a native background service and user-facing GUI application on the client's workstation.

---

## 1. Core Responsibilities

1. **User-Authorized Directory Scanning:**
   Scans explicitly authorized directories (e.g., `Documents`, `Videos`, `Projects`) without traversing operating system protected system trees (`Windows`, `Program Files`, `/etc`, `/sys`).
2. **Incremental Metadata Indexing:**
   Extracts file size, extension, MIME type, modification timestamp, and computes a rolling 64KB chunked SHA-256 digest. Stored inside a local WAL-enabled SQLite database (`local_index.db`).
3. **Filesystem Change Monitoring (`file_watcher.py`):**
   Hooks into filesystem events (`created`, `modified`, `deleted`, `moved`) to incrementally update indices without requiring full-folder rescans.
4. **Weighted-LRU Local Cache Manager (`smart_cache.py`):**
   Caches frequently accessed assets locally up to a configurable byte threshold (`MAX_CACHE_SIZE_GB`). Evicts files using cost-weighted recency and access count.
5. **Zero-Trust Device Identity (`device_auth.py`):**
   Generates a persistent hardware/OS fingerprint (`device_fingerprint`) and establishes an authenticated, tokenized session with the central Flask API.

---

## 2. Directory Structure

```
desktop/
├── agent/
│   ├── indexer/
│   │   └── local_indexer.py     # SQLite metadata indexer with WAL mode
│   ├── scanner/
│   │   └── local_scanner.py     # Safe folder walker & SHA-256 rolling digest
│   ├── watcher/
│   │   └── file_watcher.py      # Incremental filesystem notification listener
│   ├── cache/
│   │   └── smart_cache.py       # Weighted LRU cache eviction manager
│   ├── security/
│   │   └── device_auth.py       # Device fingerprinting & token storage
│   ├── network/
│   │   └── network_probe.py     # RTT latency and link state monitoring
│   └── sync/
│       └── cloud_sync.py        # Central API sync & heartbeat loop
├── desktop_app.py               # Native GUI application
└── tests/
    └── test_agent.py            # Local agent test suite
```
