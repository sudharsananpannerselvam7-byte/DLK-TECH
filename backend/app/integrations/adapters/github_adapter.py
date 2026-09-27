"""
SmartFlow GitHub Source Adapter
Connects to authorized GitHub repositories to index code, media, datasets, and releases.
Streams files via chunked HTTP transfers without loading full content into RAM.
"""
import io
import mimetypes
import os
import urllib.request
import json
from datetime import datetime, timezone
from typing import Generator, List, Optional, Tuple

from app.integrations.adapters.base import SourceAdapter, SourceMetadata, SourceVersion


class GitHubAdapter(SourceAdapter):
    """
    Adapter for authorized GitHub repositories.
    Uses official GitHub REST API v3.
    """

    def __init__(self, repo: str, token: Optional[str] = None, branch: str = "main"):
        """
        repo: format "owner/repo" (e.g. "sudharsananpannerselvam7-byte/DLK-TECH")
        token: personal access token (optional for public repositories)
        """
        self.repo = repo.strip("/")
        self.token = token or os.environ.get("GITHUB_TOKEN")
        self.branch = branch
        self.api_base = f"https://api.github.com/repos/{self.repo}"

    def get_name(self) -> str:
        return "github"

    def _headers(self) -> dict:
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "SmartFlow-Data-Accelerator/1.0",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def test_connection(self) -> bool:
        try:
            req = urllib.request.Request(self.api_base, headers=self._headers())
            with urllib.request.urlopen(req, timeout=8) as resp:
                return resp.status == 200
        except Exception:
            return False

    def list_content(
        self,
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        limit: int = 100,
    ) -> Tuple[List[SourceMetadata], Optional[str]]:
        path = folder_id.strip("/") if folder_id else ""
        url = f"{self.api_base}/contents/{path}?ref={self.branch}"
        items: List[SourceMetadata] = []

        try:
            req = urllib.request.Request(url, headers=self._headers())
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            if isinstance(data, dict) and data.get("type") == "file":
                data = [data]

            for entry in data:
                if entry.get("type") == "file":
                    fname = entry.get("name", "")
                    mime, _ = mimetypes.guess_type(fname)
                    items.append(
                        SourceMetadata(
                            external_id=entry.get("path", fname),
                            name=fname,
                            mime_type=mime or "application/octet-stream",
                            size_bytes=entry.get("size", 0),
                            checksum=entry.get("sha"),
                            etag=entry.get("sha"),
                            modified_at=datetime.now(timezone.utc),
                            extra={
                                "download_url": entry.get("download_url"),
                                "html_url": entry.get("html_url"),
                                "repo": self.repo,
                            },
                        )
                    )
                if len(items) >= limit:
                    break

            return items, None
        except Exception:
            return [], None

    def get_metadata(self, external_id: str) -> Optional[SourceMetadata]:
        url = f"{self.api_base}/contents/{external_id}?ref={self.branch}"
        try:
            req = urllib.request.Request(url, headers=self._headers())
            with urllib.request.urlopen(req, timeout=10) as resp:
                entry = json.loads(resp.read().decode("utf-8"))

            fname = entry.get("name", external_id)
            mime, _ = mimetypes.guess_type(fname)
            return SourceMetadata(
                external_id=entry.get("path", external_id),
                name=fname,
                mime_type=mime or "application/octet-stream",
                size_bytes=entry.get("size", 0),
                checksum=entry.get("sha"),
                etag=entry.get("sha"),
                modified_at=datetime.now(timezone.utc),
                extra={"download_url": entry.get("download_url"), "repo": self.repo},
            )
        except Exception:
            return None

    def get_version(self, external_id: str) -> Optional[SourceVersion]:
        meta = self.get_metadata(external_id)
        if not meta or not meta.checksum:
            return None
        return SourceVersion(version_id=meta.checksum, etag=meta.checksum, modified_at=meta.modified_at)

    def check_changes(self, external_id: str, last_version: SourceVersion) -> bool:
        current = self.get_version(external_id)
        if not current:
            return True
        return current.version_id != last_version.version_id

    def stream_content(self, external_id: str, chunk_size: int = 65536) -> Generator[bytes, None, None]:
        url = f"https://raw.githubusercontent.com/{self.repo}/{self.branch}/{external_id}"
        req = urllib.request.Request(url, headers=self._headers())
        with urllib.request.urlopen(req, timeout=15) as resp:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                yield chunk
