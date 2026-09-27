"""
SmartFlow Desktop Network Telemetry Probe
Monitors client round-trip-time (RTT), online/offline status, and sync state.
"""
import time
import urllib.request
from typing import Dict, Tuple


class NetworkProbe:
    """Evaluates network connectivity and latency to the SmartFlow API."""

    def __init__(self, api_base_url: str = "http://localhost:5000"):
        self.api_base_url = api_base_url.rstrip("/")

    def probe(self) -> Tuple[bool, float, str]:
        """
        Returns: (is_online, rtt_ms, quality)
        quality: "fast" | "medium" | "slow" | "offline"
        """
        url = f"{self.api_base_url}/api/v1/health/live"
        start = time.perf_counter()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SmartFlow-Desktop-Agent/1.0"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    rtt_ms = (time.perf_counter() - start) * 1000
                    if rtt_ms < 50:
                        quality = "fast"
                    elif rtt_ms < 180:
                        quality = "medium"
                    else:
                        quality = "slow"
                    return True, round(rtt_ms, 1), quality
        except Exception:
            pass

        return False, 0.0, "offline"
