"""SmartFlow Adapters Package"""
from .base import SourceAdapter, SourceMetadata, SourceVersion
from .local_adapter import LocalAdapter
from .google_drive_adapter import GoogleDriveAdapter
from .github_adapter import GitHubAdapter

__all__ = ["SourceAdapter", "SourceMetadata", "SourceVersion", "LocalAdapter", "GoogleDriveAdapter", "GitHubAdapter"]


def get_adapter(adapter_type: str, config: dict) -> SourceAdapter:
    """Factory: return the correct adapter instance for a source type."""
    adapters = {
        "local": LocalAdapter,
        "google_drive": GoogleDriveAdapter,
        "github": GitHubAdapter,
    }
    cls = adapters.get(adapter_type)
    if not cls:
        raise ValueError(f"Unknown adapter type: {adapter_type}. Supported: {list(adapters.keys())}")

    if adapter_type == "local":
        return cls(config.get("base_path", "uploads"), config.get("allowed_extensions"))
    elif adapter_type == "github":
        return cls(config.get("repo", "sudharsananpannerselvam7-byte/DLK-TECH"), config.get("token"), config.get("branch", "main"))
    return cls(config)
