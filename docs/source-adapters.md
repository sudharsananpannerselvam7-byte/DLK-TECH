# SmartFlow Source Adapter Architecture

## 1. Abstract Source Interface

All storage backends and third-party media repositories inherit from `BaseSourceAdapter`:

```python
class BaseSourceAdapter(ABC):
    @abstractmethod
    def get_metadata(self, source_item_id: str) -> SourceItemMetadata:
        """Fetch metadata, MIME type, size, and etag from the source."""
        pass

    @abstractmethod
    def list_content(self, limit: int = 50, cursor: Optional[str] = None) -> List[SourceItemMetadata]:
        """List accessible files or items in the authorized repository."""
        pass

    @abstractmethod
    def stream_content(self, source_item_id: str, byte_start: int, byte_end: int) -> Generator[bytes, None, None]:
        """Yield byte chunks for range streaming without full memory loading."""
        pass

    @abstractmethod
    def check_changes(self, last_sync_time: datetime) -> List[SourceItemDelta]:
        """Detect modified or newly published items."""
        pass
```

---

## 2. Implemented Adapters

### 2.1 LocalAuthorizedStorageAdapter
- Direct filesystem ingestion from approved subdirectories.
- Bounded chunk streaming using standard Python `open(path, 'rb')` with file descriptors.

### 2.2 S3Adapter / ObjectStorageAdapter
- Interacts with AWS S3, Cloudflare R2, MinIO, or DigitalOcean Spaces via Boto3.
- Range requests passed directly to S3 `Range: bytes=X-Y` header.

### 2.3 GoogleDriveAdapter
- Authenticates using Google Service Account credentials (`GOOGLE_SERVICE_ACCOUNT_JSON`).
- Queries Google Drive v3 API for files in designated `folder_id`.
- Credentials remain on backend and are never returned to client.

### 2.4 ApiAdapter
- Syncs authorized external REST API content catalogs.
- Applies strict SSRF URL validation.
