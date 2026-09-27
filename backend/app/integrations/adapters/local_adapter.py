"""
SmartFlow Local Authorized Storage Adapter
Serves files from the local filesystem under a configured path.
Supports streaming, range requests, and metadata extraction.
"""
import hashlib
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, List, Optional

import structlog

from .base import SourceAdapter, SourceMetadata, SourceVersion

logger = structlog.get_logger(__name__)

# SSRF / path traversal protection
ALLOWED_EXTENSIONS = {
    ".mp4", ".mkv", ".mov", ".avi", ".webm",  # Video
    ".mp3", ".wav", ".flac", ".aac", ".ogg",  # Audio
    ".jpg", ".jpeg", ".png", ".gif", ".webp",  # Images
    ".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md",  # Documents
    ".zip", ".tar", ".gz",  # Archives
    ".json", ".csv", ".xml",  # Data
}


class LocalAdapter(SourceAdapter):
    """Serves content from a local authorized storage path."""

    def __init__(self, base_path: str, allowed_extensions: Optional[set] = None):
        self.base_path = Path(base_path).resolve()
        self.allowed_extensions = allowed_extensions or ALLOWED_EXTENSIONS
        self.base_path.mkdir(parents=True, exist_ok=True)

    def get_name(self) -> str:
        return "local"

    def test_connection(self) -> bool:
        return self.base_path.exists() and self.base_path.is_dir()

    def _safe_path(self, external_id: str) -> Optional[Path]:
        """Resolve path and ensure it's within base_path (path traversal protection)."""
        try:
            # external_id is a relative path within base_path
            resolved = (self.base_path / external_id).resolve()
            # Ensure resolved path is within base_path
            resolved.relative_to(self.base_path)
            if resolved.suffix.lower() not in self.allowed_extensions:
                logger.warning("blocked_extension", path=str(resolved))
                return None
            return resolved
        except (ValueError, Exception) as e:
            logger.warning("path_traversal_attempt", external_id=external_id[:100], error=str(e))
            return None

    def list_content(
        self,
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        limit: int = 100,
    ) -> tuple[List[SourceMetadata], Optional[str]]:
        search_path = self.base_path if not folder_id else (self.base_path / folder_id)
        if not search_path.exists():
            return [], None

        items = []
        offset = int(page_token or 0)
        all_files = sorted(
            [f for f in search_path.rglob("*") if f.is_file() and f.suffix.lower() in self.allowed_extensions]
        )

        page = all_files[offset:offset + limit]
        for f in page:
            relative = str(f.relative_to(self.base_path)).replace("\\", "/")
            stat = f.stat()
            mime = mimetypes.guess_type(str(f))[0]
            items.append(SourceMetadata(
                external_id=relative,
                name=f.name,
                mime_type=mime,
                size_bytes=stat.st_size,
                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            ))

        next_token = str(offset + limit) if offset + limit < len(all_files) else None
        return items, next_token

    def get_metadata(self, external_id: str) -> Optional[SourceMetadata]:
        path = self._safe_path(external_id)
        if not path or not path.exists():
            return None
        stat = path.stat()
        mime = mimetypes.guess_type(str(path))[0]
        return SourceMetadata(
            external_id=external_id,
            name=path.name,
            mime_type=mime,
            size_bytes=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        )

    def get_version(self, external_id: str) -> Optional[SourceVersion]:
        path = self._safe_path(external_id)
        if not path or not path.exists():
            return None
        stat = path.stat()
        etag = f"{int(stat.st_mtime)}-{stat.st_size}"
        return SourceVersion(
            version_id=etag,
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            etag=etag,
        )

    def check_changes(self, external_id: str, last_version: SourceVersion) -> bool:
        current = self.get_version(external_id)
        if not current:
            return False
        return current.version_id != last_version.version_id

    def stream_content(self, external_id: str, chunk_size: int = 65536) -> Generator[bytes, None, None]:
        """Stream file content in chunks. Never loads into memory."""
        path = self._safe_path(external_id)
        if not path or not path.exists():
            return

        with open(path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def stream_range(
        self, external_id: str, start: int, end: int, chunk_size: int = 65536
    ) -> Generator[bytes, None, None]:
        """Stream a byte range. Supports HTTP Range requests."""
        path = self._safe_path(external_id)
        if not path or not path.exists():
            return

        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
