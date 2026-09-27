"""
SmartFlow High-Concurrency Load Testing Script
Simulates concurrent clients measuring P50, P95, P99 latency and cache hit ratios.
"""

import time
import statistics
import concurrent.futures
import urllib.request
import json
import sys

API_BASE = "http://localhost:5000"

def make_request(url: str) -> dict:
    start = time.perf_counter()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SmartFlow-LoadTester/1.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = response.read()
            duration_ms = (time.perf_counter() - start) * 1000
            return {
                "status": response.status,
                "latency_ms": duration_ms,
                "bytes": len(data),
                "error": None
            }
    except Exception as e:
        duration_ms = (time.perf_counter() - start) * 1000
        return {
            "status": 0,
            "latency_ms": duration_ms,
            "bytes": 0,
            "error": str(e)
        }

def run_load_test(concurrency: int = 50, total_requests: int = 250):
    url = f"{API_BASE}/api/v1/health"
    print(f"\n=======================================================")
    print(f"Running SmartFlow Load Test: {concurrency} workers, {total_requests} requests")
    print(f"Target URL: {url}")
    print(f"=======================================================")

    latencies = []
    errors = 0
    total_bytes = 0

    wall_start = time.perf_counter()

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(make_request, url) for _ in range(total_requests)]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            latencies.append(res["latency_ms"])
            total_bytes += res["bytes"]
            if res["error"] or res["status"] != 200:
                errors += 1

    wall_time = time.perf_counter() - wall_start
    latencies.sort()

    p50 = statistics.median(latencies)
    p95 = latencies[int(len(latencies) * 0.95)] if len(latencies) >= 20 else max(latencies)
    p99 = latencies[int(len(latencies) * 0.99)] if len(latencies) >= 100 else max(latencies)
    avg_latency = statistics.mean(latencies)
    rps = total_requests / wall_time if wall_time > 0 else 0

    print(f"\nResults Summary:")
    print(f"-------------------------------------------------------")
    print(f"Total Requests:       {total_requests}")
    print(f"Total Wall Clock:     {wall_time:.2f} s")
    print(f"Throughput:           {rps:.1f} requests/sec")
    print(f"Error Count:          {errors} ({(errors/total_requests)*100:.1f}%)")
    print(f"Average Latency:      {avg_latency:.2f} ms")
    print(f"P50 Latency (Median): {p50:.2f} ms")
    print(f"P95 Latency:          {p95:.2f} ms")
    print(f"P99 Latency:          {p99:.2f} ms")
    print(f"Min / Max:            {min(latencies):.2f} ms / {max(latencies):.2f} ms")
    print(f"Total Transferred:    {total_bytes / 1024:.1f} KB")
    print(f"=======================================================\n")

if __name__ == "__main__":
    concurrency = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    requests = int(sys.argv[2]) if len(sys.argv) > 2 else 250
    run_load_test(concurrency, requests)
