"""
SmartFlow Desktop Cloud Synchronizer
Manages authenticated device registration, heartbeat sync, and prediction telemetry
with the central SmartFlow platform.
"""
import json
import urllib.request
from typing import Dict, Optional

from desktop.agent.security.device_auth import DeviceAuthenticator
from desktop.agent.network.network_probe import NetworkProbe


class CloudSyncManager:
    """Coordinates cloud device registration and telemetry synchronization."""

    def __init__(self, auth: DeviceAuthenticator, probe: NetworkProbe, api_base: str = "http://localhost:5000"):
        self.auth = auth
        self.probe = probe
        self.api_base = api_base.rstrip("/")
        self.registered_device_id: Optional[str] = None

    def register_or_heartbeat(self, token: Optional[str] = None) -> bool:
        if token:
            self.auth.set_auth_token(token)

        jwt_token = self.auth.access_token
        if not jwt_token:
            return False

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {jwt_token}",
            "User-Agent": "SmartFlow-Desktop-Agent/1.0",
        }

        # 1. Register device if not already registered
        if not self.registered_device_id:
            try:
                payload = json.dumps(self.auth.get_registration_payload()).encode("utf-8")
                req = urllib.request.Request(f"{self.api_base}/api/v1/devices/register", data=payload, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("success"):
                        self.registered_device_id = data["data"]["id"]
                        return True
            except Exception:
                return False

        # 2. Heartbeat if already registered
        if self.registered_device_id:
            try:
                req = urllib.request.Request(
                    f"{self.api_base}/api/v1/devices/{self.registered_device_id}/heartbeat",
                    data=b"{}",
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    return resp.status == 200
            except Exception:
                return False

        return False
