"""
SmartFlow Source Adapter Interface
Abstract base class for all content sources.
All adapters must implement this interface to ensure source-independent operation.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Generator, Iterator, List, Optional


@dataclass
class SourceMetadata:
    """Metadata about a source item (file/document/media)."""
    external_id: str
    name: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    checksum: Optional[str] = None
    etag: Optional[str] = None
    modified_at: Optional[datetime] = None
    extra: dict = field(default_factory=dict)


@dataclass
class SourceVersion:
    """Version info for change detection."""
    version_id: str
    modified_at: Optional[datetime] = None
    etag: Optional[str] = None


class SourceAdapter(ABC):
    """
    Abstract interface for all content source adapters.
    Implementations: GoogleDriveAdapter, S3Adapter, LocalAdapter, ApiAdapter, MinIOAdapter.
    """

    @abstractmethod
    def get_name(self) -> str:
        """Return the adapter type name."""
        ...

    @abstractmethod
    def test_connection(self) -> bool:
        """Verify connectivity and authentication. Returns True if healthy."""
        ...

    @abstractmethod
    def list_content(
        self,
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        limit: int = 100,
    ) -> tuple[List[SourceMetadata], Optional[str]]:
        """
        List available content items.
        Returns (items, next_page_token).
        """
        ...

    @abstractmethod
    def get_metadata(self, external_id: str) -> Optional[SourceMetadata]:
        """Get metadata for a single item by its external ID."""
        ...

    @abstractmethod
    def get_version(self, external_id: str) -> Optional[SourceVersion]:
        """Get version info for change detection (ETag, modified_at)."""
        ...

    @abstractmethod
    def check_changes(self, external_id: str, last_version: SourceVersion) -> bool:
        """Return True if the item has changed since last_version."""
        ...

    @abstractmethod
    def stream_content(self, external_id: str, chunk_size: int = 65536) -> Generator[bytes, None, None]:
        """
        Stream content as bytes chunks. Never loads entire file into memory.
        chunk_size: bytes per chunk (default 64KB).
        """
        ...

    def get_content_url(self, external_id: str, expires_in: int = 3600) -> Optional[str]:
        """
        Get a temporary direct download URL (if supported by the source).
        Returns None if not supported.
        """
        return None
