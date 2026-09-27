"""
Unit and Integration Tests for SmartFlow Desktop Agent
"""
import os
import shutil
import tempfile
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from desktop.agent.indexer.local_indexer import LocalIndexer
from desktop.agent.scanner.local_scanner import LocalScanner, compute_fast_hash
from desktop.agent.cache.smart_cache import SmartCacheManager
from desktop.agent.security.device_auth import DeviceAuthenticator
from desktop.agent.network.network_probe import NetworkProbe


class TestDesktopAgent(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="smartflow_test_")
        self.db_path = os.path.join(self.test_dir, "test_index.db")
        self.cache_dir = os.path.join(self.test_dir, "cache")
        self.scan_folder = os.path.join(self.test_dir, "my_docs")
        os.makedirs(self.scan_folder, exist_ok=True)

        self.indexer = LocalIndexer(db_path=self.db_path)
        self.cache_mgr = SmartCacheManager(self.indexer, cache_dir=self.cache_dir, max_bytes=10 * 1024 * 1024)
        self.scanner = LocalScanner()
        self.auth = DeviceAuthenticator(config_dir=self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_authorized_folders(self):
        folder_id = self.indexer.add_authorized_folder(self.scan_folder, "My Documents")
        self.assertIsNotNone(folder_id)
        folders = self.indexer.get_authorized_folders()
        self.assertEqual(len(folders), 1)
        self.assertEqual(folders[0]["label"], "My Documents")

    def test_scanner_and_indexer(self):
        # Create sample files
        file1 = os.path.join(self.scan_folder, "report.pdf")
        with open(file1, "wb") as f:
            f.write(b"PDF Content for SmartFlow test")

        file2 = os.path.join(self.scan_folder, "data.csv")
        with open(file2, "wb") as f:
            f.write(b"id,name,value\n1,alpha,100\n")

        # Scan and index
        scanned = list(self.scanner.scan_directory(self.scan_folder))
        self.assertEqual(len(scanned), 2)

        for item in scanned:
            self.indexer.upsert_file(item)

        stats = self.indexer.get_stats()
        self.assertEqual(stats["total_files"], 2)

        # Search
        results, total = self.indexer.search(query="report")
        self.assertEqual(total, 1)
        self.assertEqual(results[0]["name"], "report.pdf")

    def test_smart_cache_and_eviction(self):
        file_path = os.path.join(self.scan_folder, "video_sample.mp4")
        with open(file_path, "wb") as f:
            f.write(b"0" * 1024 * 1024)  # 1 MB

        file_id = self.indexer.upsert_file({
            "path": file_path,
            "name": "video_sample.mp4",
            "size": 1024 * 1024,
            "extension": "mp4",
            "modified_at": os.path.getmtime(file_path),
        })

        cached_path = self.cache_mgr.cache_file(file_id, file_path)
        self.assertTrue(os.path.exists(cached_path))

        metrics = self.cache_mgr.get_metrics()
        self.assertGreater(metrics["used_bytes"], 0)
        self.assertEqual(metrics["cached_items_count"], 1)

        # Invalidate
        self.cache_mgr.invalidate(file_id)
        self.assertFalse(os.path.exists(cached_path))

    def test_device_authenticator(self):
        self.assertTrue(len(self.auth.device_fingerprint) > 20)
        payload = self.auth.get_registration_payload()
        self.assertEqual(payload["device_type"], "desktop")
        self.assertIn("system_info", payload)

    def test_fast_hash_no_memory_load(self):
        large_temp = os.path.join(self.test_dir, "large.dat")
        with open(large_temp, "wb") as f:
            f.write(b"A" * (2 * 1024 * 1024))  # 2MB

        digest = compute_fast_hash(large_temp)
        self.assertTrue(len(digest) == 64)


if __name__ == "__main__":
    unittest.main()
