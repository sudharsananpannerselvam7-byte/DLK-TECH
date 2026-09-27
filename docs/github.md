# GitHub Repository Integration

SmartFlow indexes authorized GitHub repositories for lightning-fast search, tree exploration, and offline inspection.

## 1. Capabilities
- Connects via GitHub Personal Access Token or OAuth GitHub App.
- Indexes repository file trees (`/repos/{owner}/{repo}/git/trees/{sha}`).
- Caches source code, documentation, and release binary assets locally.
- Respects GitHub REST API v3 rate limits (5,000 requests/hr for authenticated tokens) with exponential backoff.
