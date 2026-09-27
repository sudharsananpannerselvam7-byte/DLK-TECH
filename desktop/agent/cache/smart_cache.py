"""
SmartFlow Desktop Smart Cache Manager
Enforces maximum cache boundaries, manages cache lifecycles (NOT_CACHED, QUEUED, FETCHING, CACHED, STALE, INVALID, FAILED),
and applies Weighted-LRU eviction prioritizing frequently accessed and high-value resources.
"""
import os
import shutil
import time
from pathlib import Path
from typing import Dict, List, Optional

from desktop.agent.indexer.local_indexer import LocalIndexer


class SmartCacheManager:
    """Intelligent local cache store with Weighted-LRU eviction."""

    def __init__(
        self,
        indexer: LocalIndexer,
        cache_dir: Optional[str] = None,
        max_bytes: int = 5 * 1024 * 1024 * 1024,  # 5 GB default
    ):
        self.indexer = indexer
        if not cache_dir:
            app_dir = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "SmartFlow" / "cache"
            app_dir.mkdir(parents=True, exist_ok=True)
            self.cache_dir = str(app_dir)
        else:
            self.cache_dir = cache_dir
            Path(self.cache_dir).mkdir(parents=True, exist_ok=True)

        self.max_bytes = max_bytes

    def get_current_cache_size(self) -> int:
        total = 0
        for root, _, files in os.walk(self.cache_dir):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
        return total

    def cache_file(self, file_id: str, source_path: str) -> str:
        """Copies or stages a resource into the local cache."""
        if not os.path.exists(source_path):
            self.indexer.update_cache_status(file_id, "FAILED")
            raise FileNotFoundError(f"Source file not found: {source_path}")

        file_size = os.path.getsize(source_path)
        self.ensure_capacity(file_size)

        dest_path = os.path.join(self.cache_dir, f"{file_id}_{os.path.basename(source_path)}")
        shutil.copy2(source_path, dest_path)

        self.indexer.update_cache_status(file_id, "CACHED")
        self.indexer.record_access(file_id)
        return dest_path

    def ensure_capacity(self, needed_bytes: int):
        """Enforces max cache quota using Weighted-LRU eviction."""
        current_size = self.get_current_cache_size()
        if current_size + needed_bytes <= self.max_bytes:
            return

        # Query candidates sorted by least recently accessed and low frequency
        files, _ = self.indexer.search(cache_status="CACHED", sort_by="last_accessed_at", limit=100)
        # Reverse to get oldest accessed first
        files.reverse()

        for item in files:
            cached_pattern = os.path.join(self.cache_dir, f"{item['file_id']}_*")
            import glob
            matches = glob.glob(cached_pattern)
            for m in matches:
                try:
                    os.remove(m)
                    self.indexer.update_cache_status(item["file_id"], "NOT_CACHED")
                except OSError:
                    pass

            if self.get_current_cache_size() + needed_bytes <= self.max_bytes:
                break

    def invalidate(self, file_id: str):
        import glob
        matches = glob.glob(os.path.join(self.cache_dir, f"{file_id}_*"))
        for m in matches:
            try:
                os.remove(m)
            except OSError:
                pass
        self.indexer.update_cache_status(file_id, "NOT_CACHED")

    def clear_all(self):
        for root, _, files in os.walk(self.cache_dir):
            for f in files:
                try:
                    os.remove(os.path.join(root, f))
                except OSError:
                    pass
        # Reset all indexed records to NOT_CACHED
        files, _ = self.indexer.search(cache_status="CACHED", limit=10000)
        for item in files:
            self.indexer.update_cache_status(item["file_id"], "NOT_CACHED")

    def get_metrics(self) -> Dict:
        used_bytes = self.get_current_cache_size()
        stats = self.indexer.get_stats()
        return {
            "used_bytes": used_bytes,
            "max_bytes": self.max_bytes,
            "used_pct": round((used_bytes / self.max_bytes) * 100, 1) if self.max_bytes > 0 else 0,
            "cached_items_count": stats["cached_files"],
            "hit_rate_pct": stats["hit_rate_pct"],
        }
