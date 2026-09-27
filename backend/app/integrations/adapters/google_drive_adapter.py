"""
SmartFlow Google Drive Adapter
Authenticates via Service Account, lists and streams files securely.
Credentials NEVER reach the frontend.
"""
import io
import json
from datetime import datetime, timezone
from typing import Generator, List, Optional

import structlog

from .base import SourceAdapter, SourceMetadata, SourceVersion

logger = structlog.get_logger(__name__)


class GoogleDriveAdapter(SourceAdapter):
    """
    Google Drive source adapter using Service Account authentication.
    
    Required config keys:
      - service_account_json: JSON string of service account credentials
      - folder_id: Google Drive folder ID to sync from (optional)
    """

    def __init__(self, config: dict):
        self._config = config
        self._service = None
        self._initialized = False

    def _ensure_initialized(self):
        if self._initialized:
            return
        try:
            import googleapiclient.discovery
            from google.oauth2 import service_account

            sa_json = self._config.get("service_account_json")
            if not sa_json:
                raise ValueError("service_account_json is required for GoogleDriveAdapter")

            if isinstance(sa_json, str):
                sa_info = json.loads(sa_json)
            else:
                sa_info = sa_json

            credentials = service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=["https://www.googleapis.com/auth/drive.readonly"],
            )
            self._service = googleapiclient.discovery.build("drive", "v3", credentials=credentials)
            self._initialized = True
        except ImportError:
            raise RuntimeError("google-api-python-client is required for Google Drive adapter")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Google Drive adapter: {e}")

    def get_name(self) -> str:
        return "google_drive"

    def test_connection(self) -> bool:
        try:
            self._ensure_initialized()
            self._service.about().get(fields="user").execute()
            return True
        except Exception as e:
            logger.warning("gdrive_connection_failed", error=str(e))
            return False

    def list_content(
        self,
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        limit: int = 100,
    ) -> tuple[List[SourceMetadata], Optional[str]]:
        self._ensure_initialized()
        folder_id = folder_id or self._config.get("folder_id")

        query = "trashed = false"
        if folder_id:
            query += f" and '{folder_id}' in parents"

        try:
            request = self._service.files().list(
                q=query,
                pageSize=min(limit, 1000),
                pageToken=page_token,
                fields="nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime, etag)",
            )
            response = request.execute()
            files = response.get("files", [])
            next_token = response.get("nextPageToken")

            items = []
            for f in files:
                items.append(SourceMetadata(
                    external_id=f["id"],
                    name=f.get("name", ""),
                    mime_type=f.get("mimeType"),
                    size_bytes=int(f.get("size", 0)) if f.get("size") else None,
                    checksum=f.get("md5Checksum"),
                    etag=f.get("etag"),
                    modified_at=datetime.fromisoformat(f["modifiedTime"].rstrip("Z")).replace(tzinfo=timezone.utc)
                    if f.get("modifiedTime") else None,
                ))

            return items, next_token
        except Exception as e:
            logger.error("gdrive_list_failed", error=str(e))
            return [], None

    def get_metadata(self, external_id: str) -> Optional[SourceMetadata]:
        self._ensure_initialized()
        try:
            f = self._service.files().get(
                fileId=external_id,
                fields="id, name, mimeType, size, md5Checksum, modifiedTime, etag",
            ).execute()
            return SourceMetadata(
                external_id=f["id"],
                name=f.get("name", ""),
                mime_type=f.get("mimeType"),
                size_bytes=int(f.get("size", 0)) if f.get("size") else None,
                checksum=f.get("md5Checksum"),
                etag=f.get("etag"),
                modified_at=datetime.fromisoformat(f["modifiedTime"].rstrip("Z")).replace(tzinfo=timezone.utc)
                if f.get("modifiedTime") else None,
            )
        except Exception as e:
            logger.warning("gdrive_metadata_failed", file_id=external_id, error=str(e))
            return None

    def get_version(self, external_id: str) -> Optional[SourceVersion]:
        meta = self.get_metadata(external_id)
        if not meta:
            return None
        return SourceVersion(
            version_id=meta.etag or meta.checksum or str(meta.modified_at),
            modified_at=meta.modified_at,
            etag=meta.etag,
        )

    def check_changes(self, external_id: str, last_version: SourceVersion) -> bool:
        current = self.get_version(external_id)
        if not current:
            return False
        return current.version_id != last_version.version_id

    def stream_content(self, external_id: str, chunk_size: int = 65536) -> Generator[bytes, None, None]:
        """Stream file content in chunks (never loads entire file into memory)."""
        self._ensure_initialized()
        try:
            request = self._service.files().get_media(fileId=external_id)
            from googleapiclient.http import MediaIoBaseDownload
            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request, chunksize=chunk_size)
            done = False
            while not done:
                _, done = downloader.next_chunk()
                buffer.seek(0)
                data = buffer.read()
                if data:
                    yield data
                buffer.seek(0)
                buffer.truncate(0)
        except Exception as e:
            logger.error("gdrive_stream_failed", file_id=external_id, error=str(e))
