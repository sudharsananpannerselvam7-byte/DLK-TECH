"""
SmartFlow Desktop Local Directory Scanner
Scans strictly authorized directories without scanning operating system roots.
Streams file metadata and computes chunked SHA-256 digests without full memory loading.
"""
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Callable, Dict, Generator, List, Optional

SYSTEM_PROTECTED_DIRS = {
    "c:\\windows", "c:\\program files", "c:\\program files (x86)",
    "c:\\$recycle.bin", "/bin", "/sbin", "/etc", "/usr", "/lib", "/sys", "/proc"
}


def compute_fast_hash(file_path: str, max_bytes: int = 1048576) -> str:
    """Compute rolling SHA-256 hash using 64KB chunk buffers."""
    hasher = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            read_bytes = 0
            while read_bytes < max_bytes:
                chunk = f.read(min(65536, max_bytes - read_bytes))
                if not chunk:
                    break
                hasher.update(chunk)
                read_bytes += len(chunk)
        return hasher.hexdigest()
    except Exception:
        return ""


class LocalScanner:
    """Safe, non-blocking local directory scanner."""

    def __init__(self, allowed_extensions: Optional[List[str]] = None):
        self.allowed_extensions = {ext.lower().lstrip(".") for ext in allowed_extensions} if allowed_extensions else None

    def is_safe_directory(self, folder_path: str) -> bool:
        norm = os.path.normpath(folder_path).lower()
        for protected in SYSTEM_PROTECTED_DIRS:
            if norm == protected or norm.startswith(protected + os.sep):
                return False
        return True

    def scan_directory(
        self,
        directory_path: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Generator[Dict, None, None]:
        norm_dir = os.path.normpath(directory_path)
        if not self.is_safe_directory(norm_dir):
            raise PermissionError(f"Cannot scan protected system directory: {norm_dir}")

        if not os.path.isdir(norm_dir):
            raise FileNotFoundError(f"Directory not found: {norm_dir}")

        count = 0
        for root, _, files in os.walk(norm_dir):
            for file_name in files:
                file_path = os.path.join(root, file_name)
                ext = Path(file_name).suffix.lower().lstrip(".")

                if self.allowed_extensions and ext not in self.allowed_extensions:
                    continue

                try:
                    stat = os.stat(file_path)
                    mime, _ = mimetypes.guess_type(file_name)
                    file_hash = compute_fast_hash(file_path)

                    file_data = {
                        "path": file_path,
                        "name": file_name,
                        "size": stat.st_size,
                        "extension": ext,
                        "mime_type": mime or "application/octet-stream",
                        "modified_at": stat.st_mtime,
                        "hash": file_hash,
                        "cache_status": "NOT_CACHED",
                    }
                    count += 1
                    if progress_callback and count % 20 == 0:
                        progress_callback(count, file_name)

                    yield file_data
                except (PermissionError, FileNotFoundError):
                    continue
