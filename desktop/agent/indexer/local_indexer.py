"""
SmartFlow Desktop Local Metadata Indexer
Manages local SQLite metadata database tracking authorized filesystem assets,
cache states, checksums, and rapid sub-millisecond search queries.
"""
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class LocalIndexer:
    """High-performance local metadata store backed by SQLite."""

    def __init__(self, db_path: Optional[str] = None):
        if not db_path:
            app_dir = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "SmartFlow"
            app_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = str(app_dir / "local_index.db")
        else:
            self.db_path = db_path
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS local_files (
                    file_id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    path TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    mime_type TEXT,
                    extension TEXT,
                    hash TEXT,
                    modified_at REAL NOT NULL,
                    indexed_at REAL NOT NULL,
                    last_accessed_at REAL,
                    access_count INTEGER DEFAULT 0,
                    cache_status TEXT DEFAULT 'NOT_CACHED',
                    prediction_weight REAL DEFAULT 1.0
                );
            """)

            # Rapid query indexes
            conn.execute("CREATE INDEX IF NOT EXISTS idx_files_name ON local_files(name);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_files_ext ON local_files(extension);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_files_hash ON local_files(hash);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_files_modified ON local_files(modified_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_files_accessed ON local_files(last_accessed_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_files_cache ON local_files(cache_status);")

            # Authorized folders table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS authorized_folders (
                    folder_id TEXT PRIMARY KEY,
                    folder_path TEXT UNIQUE NOT NULL,
                    label TEXT,
                    authorized_at REAL NOT NULL,
                    auto_sync INTEGER DEFAULT 1
                );
            """)

    def add_authorized_folder(self, folder_path: str, label: Optional[str] = None) -> str:
        folder_id = str(uuid.uuid4())
        norm_path = os.path.normpath(folder_path)
        with self._get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO authorized_folders (folder_id, folder_path, label, authorized_at) VALUES (?, ?, ?, ?)",
                (folder_id, norm_path, label or os.path.basename(norm_path), datetime.now(timezone.utc).timestamp()),
            )
        return folder_id

    def get_authorized_folders(self) -> List[Dict]:
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM authorized_folders ORDER BY authorized_at DESC").fetchall()
            return [dict(r) for r in rows]

    def remove_authorized_folder(self, folder_path: str):
        norm_path = os.path.normpath(folder_path)
        with self._get_connection() as conn:
            conn.execute("DELETE FROM authorized_folders WHERE folder_path = ?", (norm_path,))
            conn.execute("DELETE FROM local_files WHERE path LIKE ?", (f"{norm_path}%",))

    def upsert_file(self, file_data: Dict) -> str:
        file_id = file_data.get("file_id") or str(uuid.uuid4())
        now = datetime.now(timezone.utc).timestamp()

        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO local_files (
                    file_id, source_id, path, name, size, mime_type, extension,
                    hash, modified_at, indexed_at, last_accessed_at, access_count, cache_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    size = excluded.size,
                    mime_type = excluded.mime_type,
                    hash = excluded.hash,
                    modified_at = excluded.modified_at,
                    indexed_at = excluded.indexed_at,
                    cache_status = excluded.cache_status;
            """, (
                file_id,
                file_data.get("source_id", "local_device"),
                os.path.normpath(file_data["path"]),
                file_data["name"],
                file_data["size"],
                file_data.get("mime_type", "application/octet-stream"),
                file_data.get("extension", "").lower(),
                file_data.get("hash", ""),
                file_data.get("modified_at", now),
                now,
                file_data.get("last_accessed_at"),
                file_data.get("access_count", 0),
                file_data.get("cache_status", "NOT_CACHED"),
            ))
        return file_id

    def record_access(self, file_id: str):
        now = datetime.now(timezone.utc).timestamp()
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE local_files 
                SET access_count = access_count + 1, last_accessed_at = ?
                WHERE file_id = ?;
            """, (now, file_id))

    def update_cache_status(self, file_id: str, status: str):
        with self._get_connection() as conn:
            conn.execute("UPDATE local_files SET cache_status = ? WHERE file_id = ?", (status, file_id))

    def delete_file_by_path(self, path: str):
        with self._get_connection() as conn:
            conn.execute("DELETE FROM local_files WHERE path = ?", (os.path.normpath(path),))

    def search(
        self,
        query: str = "",
        extension: Optional[str] = None,
        cache_status: Optional[str] = None,
        sort_by: str = "last_accessed_at",
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Dict], int]:
        sql = "SELECT * FROM local_files WHERE 1=1"
        count_sql = "SELECT COUNT(*) as total FROM local_files WHERE 1=1"
        params: list = []

        if query:
            sql += " AND (name LIKE ? OR path LIKE ?)"
            count_sql += " AND (name LIKE ? OR path LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%"])

        if extension:
            sql += " AND extension = ?"
            count_sql += " AND extension = ?"
            params.append(extension.lower().lstrip("."))

        if cache_status:
            sql += " AND cache_status = ?"
            count_sql += " AND cache_status = ?"
            params.append(cache_status.upper())

        valid_sorts = {
            "name": "name ASC",
            "size": "size DESC",
            "modified_at": "modified_at DESC",
            "last_accessed_at": "last_accessed_at DESC",
            "access_count": "access_count DESC",
        }
        order_clause = valid_sorts.get(sort_by, "last_accessed_at DESC")
        sql += f" ORDER BY {order_clause} LIMIT ? OFFSET ?"

        with self._get_connection() as conn:
            total = conn.execute(count_sql, params).fetchone()["total"]
            rows = conn.execute(sql, params + [limit, offset]).fetchall()
            return [dict(r) for r in rows], total

    def get_stats(self) -> Dict:
        with self._get_connection() as conn:
            row = conn.execute("""
                SELECT 
                    COUNT(*) as total_files,
                    COALESCE(SUM(size), 0) as total_bytes,
                    SUM(CASE WHEN cache_status = 'CACHED' THEN 1 ELSE 0 END) as cached_files,
                    SUM(CASE WHEN cache_status = 'CACHED' THEN size ELSE 0 END) as cached_bytes
                FROM local_files;
            """).fetchone()

            folders_count = conn.execute("SELECT COUNT(*) as cnt FROM authorized_folders;").fetchone()["cnt"]

            total_f = row["total_files"] or 0
            cached_f = row["cached_files"] or 0
            hit_rate = round((cached_f / total_f * 100), 1) if total_f > 0 else 0.0

            return {
                "total_files": total_f,
                "total_bytes": row["total_bytes"] or 0,
                "cached_files": cached_f,
                "cached_bytes": row["cached_bytes"] or 0,
                "authorized_folders_count": folders_count,
                "hit_rate_pct": hit_rate,
            }
