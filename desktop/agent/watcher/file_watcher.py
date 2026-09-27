"""
SmartFlow Desktop Incremental File Watcher
Monitors authorized directories for created, modified, and deleted events
performing surgical, incremental index updates without full rescans.
"""
import os
import threading
import time
from pathlib import Path
from typing import Callable, Dict, Optional, Set

from desktop.agent.indexer.local_indexer import LocalIndexer
from desktop.agent.scanner.local_scanner import compute_fast_hash


class IncrementalFileWatcher:
    """Incremental filesystem watcher with polling fallback."""

    def __init__(self, indexer: LocalIndexer, interval_sec: float = 3.0):
        self.indexer = indexer
        self.interval_sec = interval_sec
        self.watched_paths: Set[str] = set()
        self.file_snapshots: Dict[str, float] = {}  # path -> mtime
        self.running = False
        self._thread: Optional[threading.Thread] = None

    def add_watch(self, folder_path: str):
        norm = os.path.normpath(folder_path)
        if os.path.isdir(norm):
            self.watched_paths.add(norm)
            self._take_initial_snapshot(norm)

    def remove_watch(self, folder_path: str):
        norm = os.path.normpath(folder_path)
        self.watched_paths.discard(norm)
        # Remove paths under this folder from snapshot
        to_del = [p for p in self.file_snapshots if p.startswith(norm)]
        for p in to_del:
            del self.file_snapshots[p]

    def _take_initial_snapshot(self, folder_path: str):
        for root, _, files in os.walk(folder_path):
            for f in files:
                full = os.path.join(root, f)
                try:
                    self.file_snapshots[full] = os.path.getmtime(full)
                except OSError:
                    continue

    def start(self):
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=2.0)

    def _watch_loop(self):
        while self.running:
            try:
                self._check_changes()
            except Exception:
                pass
            time.sleep(self.interval_sec)

    def _check_changes(self):
        current_files: Set[str] = set()

        for folder in list(self.watched_paths):
            if not os.path.isdir(folder):
                continue

            for root, _, files in os.walk(folder):
                for f in files:
                    full = os.path.join(root, f)
                    current_files.add(full)
                    try:
                        mtime = os.path.getmtime(full)
                    except OSError:
                        continue

                    # New file detected
                    if full not in self.file_snapshots:
                        self.file_snapshots[full] = mtime
                        self._index_file(full, mtime)
                    # Modified file detected
                    elif mtime > self.file_snapshots[full]:
                        self.file_snapshots[full] = mtime
                        self._index_file(full, mtime)

        # Deleted files detected
        deleted = set(self.file_snapshots.keys()) - current_files
        for full in deleted:
            del self.file_snapshots[full]
            self.indexer.delete_file_by_path(full)

    def _index_file(self, full_path: str, mtime: float):
        try:
            stat = os.stat(full_path)
            ext = Path(full_path).suffix.lower().lstrip(".")
            import mimetypes
            mime, _ = mimetypes.guess_type(full_path)
            file_hash = compute_fast_hash(full_path)

            self.indexer.upsert_file({
                "path": full_path,
                "name": os.path.basename(full_path),
                "size": stat.st_size,
                "extension": ext,
                "mime_type": mime or "application/octet-stream",
                "modified_at": mtime,
                "hash": file_hash,
                "cache_status": "NOT_CACHED",
            })
        except OSError:
            pass
