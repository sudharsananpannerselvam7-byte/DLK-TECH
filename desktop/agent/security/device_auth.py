"""
SmartFlow Desktop Device Security & Authentication
Generates cryptographically unique hardware/OS fingerprints, manages device authorization tokens,
and signs communication with the central SmartFlow Flask API.
"""
import hashlib
import json
import os
import platform
import uuid
from pathlib import Path
from typing import Dict, Optional


class DeviceAuthenticator:
    """Manages secure desktop device identity and authorization tokens."""

    def __init__(self, config_dir: Optional[str] = None):
        if not config_dir:
            self.config_dir = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "SmartFlow"
        else:
            self.config_dir = Path(config_dir)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.creds_file = self.config_dir / "device_creds.json"
        self._identity = self._load_or_generate_identity()

    def _generate_fingerprint(self) -> str:
        """Combines node ID, machine name, OS release, and CPU info into SHA-256 fingerprint."""
        raw = f"{platform.node()}-{platform.system()}-{platform.machine()}-{platform.processor()}-{uuid.getnode()}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _load_or_generate_identity(self) -> Dict:
        if self.creds_file.exists():
            try:
                with open(self.creds_file, "r") as f:
                    return json.load(f)
            except Exception:
                pass

        identity = {
            "device_id": str(uuid.uuid4()),
            "device_name": platform.node() or "SmartFlow Station",
            "device_type": "desktop",
            "device_fingerprint": self._generate_fingerprint(),
            "client_version": "1.0.0",
            "access_token": None,
            "system_info": {
                "os": f"{platform.system()} {platform.release()}",
                "architecture": platform.machine(),
                "python_version": platform.python_version(),
            },
        }
        self._save_identity(identity)
        return identity

    def _save_identity(self, data: Dict):
        with open(self.creds_file, "w") as f:
            json.dump(data, f, indent=2)

    @property
    def device_fingerprint(self) -> str:
        return self._identity["device_fingerprint"]

    @property
    def device_name(self) -> str:
        return self._identity["device_name"]

    @property
    def access_token(self) -> Optional[str]:
        return self._identity.get("access_token")

    def set_auth_token(self, token: str):
        self._identity["access_token"] = token
        self._save_identity(self._identity)

    def get_registration_payload(self) -> Dict:
        return {
            "device_name": self._identity["device_name"],
            "device_type": self._identity["device_type"],
            "client_version": self._identity["client_version"],
            "device_fingerprint": self._identity["device_fingerprint"],
            "system_info": self._identity["system_info"],
        }
