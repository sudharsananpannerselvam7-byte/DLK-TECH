"""
SmartFlow Desktop Application
Native desktop GUI providing system status, local file engine controls,
real-time index metrics, smart cache inspection, and instant local search.
"""
import os
import sys
import threading
import time
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from desktop.agent.indexer.local_indexer import LocalIndexer
from desktop.agent.scanner.local_scanner import LocalScanner
from desktop.agent.watcher.file_watcher import IncrementalFileWatcher
from desktop.agent.cache.smart_cache import SmartCacheManager
from desktop.agent.security.device_auth import DeviceAuthenticator
from desktop.agent.network.network_probe import NetworkProbe
from desktop.agent.sync.cloud_sync import CloudSyncManager


class SmartFlowDesktopApp:
    """SmartFlow Desktop Control Center GUI."""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("SmartFlow — Intelligent Data Acceleration Desktop")
        self.root.geometry("980x680")
        self.root.minsize(800, 560)
        self.root.configure(bg="#0a0e1a")

        # Core Engines
        self.indexer = LocalIndexer()
        self.scanner = LocalScanner()
        self.watcher = IncrementalFileWatcher(self.indexer)
        self.cache_mgr = SmartCacheManager(self.indexer)
        self.auth = DeviceAuthenticator()
        self.probe = NetworkProbe()
        self.sync_mgr = CloudSyncManager(self.auth, self.probe)

        # Start background watcher
        self.watcher.start()

        # Build UI
        self._setup_styles()
        self._build_header()
        self._build_dashboard_metrics()
        self._build_main_tabs()

        # Start periodic telemetry refresh
        self._refresh_telemetry()

    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(".", background="#0a0e1a", foreground="#ffffff", font=("Segoe UI", 10))
        style.configure("Card.TFrame", background="#121829", relief="flat")
        style.configure("TNotebook", background="#0a0e1a", borderwidth=0)
        style.configure("TNotebook.Tab", background="#161f36", foreground="#a0aec0", padding=[16, 8], font=("Segoe UI", 10, "bold"))
        style.map("TNotebook.Tab", background=[("selected", "#2563eb")], foreground=[("selected", "#ffffff")])
        style.configure("Treeview", background="#0f1524", foreground="#e2e8f0", fieldbackground="#0f1524", rowheight=26, borderwidth=0)
        style.configure("Treeview.Heading", background="#1b253b", foreground="#ffffff", font=("Segoe UI", 10, "bold"))

    def _build_header(self):
        hdr = tk.Frame(self.root, bg="#0d1322", height=60, padx=20, pady=12)
        hdr.pack(fill=tk.X)

        title_frame = tk.Frame(hdr, bg="#0d1322")
        title_frame.pack(side=tk.LEFT)
        tk.Label(title_frame, text="⚡ SMARTFLOW", font=("Segoe UI", 15, "bold"), fg="#38bdf8", bg="#0d1322").pack(side=tk.LEFT)
        tk.Label(title_frame, text=" | Desktop Acceleration Engine", font=("Segoe UI", 11), fg="#94a3b8", bg="#0d1322").pack(side=tk.LEFT, padx=6)

        self.status_lbl = tk.Label(hdr, text="● SYSTEM ONLINE", font=("Segoe UI", 10, "bold"), fg="#10b981", bg="#0d1322")
        self.status_lbl.pack(side=tk.RIGHT)

    def _build_dashboard_metrics(self):
        card_bar = tk.Frame(self.root, bg="#0a0e1a", padx=16, pady=12)
        card_bar.pack(fill=tk.X)

        # 4 Metric Cards: Index, Cache, Prefetch, Network
        self.idx_card_lbl = self._create_card(card_bar, "INDEXED ASSETS", "0 files", "0.0 MB total", "#38bdf8")
        self.cache_card_lbl = self._create_card(card_bar, "LOCAL CACHE", "0 B used", "Hit Rate: 0.0%", "#10b981")
        self.prefetch_card_lbl = self._create_card(card_bar, "PREFETCH QUEUE", "Ready", "Window: Dynamic", "#a855f7")
        self.net_card_lbl = self._create_card(card_bar, "NETWORK QUALITY", "Probing...", "RTT: ~0 ms", "#fbbf24")

    def _create_card(self, parent, title, val1, val2, accent_color):
        card = tk.Frame(parent, bg="#121829", padx=14, pady=10, relief="solid", bd=1)
        card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=6)

        tk.Label(card, text=title, font=("Segoe UI", 8, "bold"), fg="#64748b", bg="#121829").pack(anchor="w")
        v1_lbl = tk.Label(card, text=val1, font=("Segoe UI", 13, "bold"), fg=accent_color, bg="#121829")
        v1_lbl.pack(anchor="w", pady=2)
        v2_lbl = tk.Label(card, text=val2, font=("Segoe UI", 9), fg="#94a3b8", bg="#121829")
        v2_lbl.pack(anchor="w")
        return {"val1": v1_lbl, "val2": v2_lbl}

    def _build_main_tabs(self):
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=16, pady=8)

        # Tab 1: Authorized Directories & Scanner
        self.tab_sources = ttk.Frame(notebook)
        notebook.add(self.tab_sources, text="📁 Authorized Folders")
        self._build_sources_tab()

        # Tab 2: Local File Search & Cache
        self.tab_search = ttk.Frame(notebook)
        notebook.add(self.tab_search, text="🔍 Local Search & Cache")
        self._build_search_tab()

        # Tab 3: System & Security Info
        self.tab_system = ttk.Frame(notebook)
        notebook.add(self.tab_system, text="⚙️ Device & Security")
        self._build_system_tab()

    def _build_sources_tab(self):
        bar = tk.Frame(self.tab_sources, bg="#0a0e1a", pady=10)
        bar.pack(fill=tk.X)

        tk.Button(bar, text="+ Authorize New Folder", font=("Segoe UI", 9, "bold"), bg="#2563eb", fg="#fff", padx=12, pady=6, bd=0, command=self._add_folder).pack(side=tk.LEFT, padx=4)
        tk.Button(bar, text="⚡ Scan All Folders", font=("Segoe UI", 9), bg="#1e293b", fg="#fff", padx=12, pady=6, bd=0, command=self._scan_all).pack(side=tk.LEFT, padx=4)

        self.sources_tree = ttk.Treeview(self.tab_sources, columns=("path", "label", "status"), show="headings", height=8)
        self.sources_tree.heading("path", text="Directory Path")
        self.sources_tree.heading("label", text="Folder Label")
        self.sources_tree.heading("status", text="Watch Status")
        self.sources_tree.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        self._reload_folders_table()

    def _build_search_tab(self):
        bar = tk.Frame(self.tab_search, bg="#0a0e1a", pady=8)
        bar.pack(fill=tk.X)

        self.search_var = tk.StringVar()
        self.search_var.trace("w", lambda *args: self._execute_search())
        tk.Label(bar, text="Search:", fg="#94a3b8", bg="#0a0e1a").pack(side=tk.LEFT, padx=4)
        search_entry = tk.Entry(bar, textvariable=self.search_var, font=("Segoe UI", 11), bg="#131b2e", fg="#fff", insertbackground="#fff", bd=1, relief="solid")
        search_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6, ipady=4)

        tk.Button(bar, text="Cache Selected", font=("Segoe UI", 9), bg="#10b981", fg="#fff", padx=10, pady=4, bd=0, command=self._cache_selected).pack(side=tk.LEFT, padx=4)
        tk.Button(bar, text="Clear Cache", font=("Segoe UI", 9), bg="#ef4444", fg="#fff", padx=10, pady=4, bd=0, command=self._clear_cache).pack(side=tk.LEFT, padx=4)

        self.files_tree = ttk.Treeview(self.tab_search, columns=("name", "size", "ext", "status", "path"), show="headings")
        self.files_tree.heading("name", text="File Name")
        self.files_tree.heading("size", text="Size")
        self.files_tree.heading("ext", text="Type")
        self.files_tree.heading("status", text="Cache Status")
        self.files_tree.heading("path", text="Full Path")
        self.files_tree.column("name", width=220)
        self.files_tree.column("size", width=80)
        self.files_tree.column("ext", width=60)
        self.files_tree.column("status", width=90)
        self.files_tree.column("path", width=340)
        self.files_tree.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

    def _build_system_tab(self):
        f = tk.Frame(self.tab_system, bg="#121829", padx=24, pady=20)
        f.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        tk.Label(f, text="Desktop Security & Platform Isolation", font=("Segoe UI", 13, "bold"), fg="#fff", bg="#121829").pack(anchor="w", pady=(0, 10))
        info_lines = [
            f"Device Name: {self.auth.device_name}",
            f"Device Fingerprint: {self.auth.device_fingerprint[:24]}...",
            f"Local Metadata Store: {self.indexer.db_path}",
            f"Local Cache Store: {self.cache_mgr.cache_dir}",
            f"Central API Endpoint: {self.sync_mgr.api_base}",
            "Security Policy: Strictly bounded to user-authorized folders. No raw filesystem API exposure.",
        ]
        for line in info_lines:
            tk.Label(f, text=f"•  {line}", font=("Segoe UI", 10), fg="#94a3b8", bg="#121829", anchor="w").pack(fill=tk.X, pady=3)

    def _add_folder(self):
        folder = filedialog.askdirectory(title="Authorize Directory for SmartFlow Acceleration")
        if folder:
            self.indexer.add_authorized_folder(folder)
            self.watcher.add_watch(folder)
            self._reload_folders_table()
            threading.Thread(target=self._scan_folder, args=(folder,), daemon=True).start()

    def _reload_folders_table(self):
        for item in self.sources_tree.get_children():
            self.sources_tree.delete(item)
        folders = self.indexer.get_authorized_folders()
        for f in folders:
            self.sources_tree.insert("", tk.END, values=(f["folder_path"], f["label"], "Active Monitoring"))

    def _scan_folder(self, folder: str):
        for item in self.scanner.scan_directory(folder):
            self.indexer.upsert_file(item)
        self.root.after(0, self._execute_search)

    def _scan_all(self):
        def worker():
            for f in self.indexer.get_authorized_folders():
                self._scan_folder(f["folder_path"])
        threading.Thread(target=worker, daemon=True).start()

    def _execute_search(self):
        q = self.search_var.get()
        files, _ = self.indexer.search(query=q, limit=100)
        for item in self.files_tree.get_children():
            self.files_tree.delete(item)
        for f in files:
            size_mb = f"{round(f['size'] / (1024 * 1024), 2)} MB" if f["size"] > 1048576 else f"{round(f['size'] / 1024, 1)} KB"
            self.files_tree.insert("", tk.END, values=(f["name"], size_mb, f["extension"], f["cache_status"], f["path"]))

    def _cache_selected(self):
        sel = self.files_tree.selection()
        if not sel:
            messagebox.showinfo("Select File", "Please select a file from the list to cache.")
            return
        item_vals = self.files_tree.item(sel[0])["values"]
        file_path = item_vals[4]
        # Find file_id
        res, _ = self.indexer.search(query=os.path.basename(file_path), limit=1)
        if res:
            try:
                self.cache_mgr.cache_file(res[0]["file_id"], file_path)
                messagebox.showinfo("Cached", f"File cached successfully: {res[0]['name']}")
                self._execute_search()
            except Exception as e:
                messagebox.showerror("Cache Error", str(e))

    def _clear_cache(self):
        if messagebox.askyesno("Clear Cache", "Purge all cached files from local disk?"):
            self.cache_mgr.clear_all()
            self._execute_search()

    def _refresh_telemetry(self):
        stats = self.indexer.get_stats()
        cache_metrics = self.cache_mgr.get_metrics()
        is_online, rtt, quality = self.probe.probe()

        # Update card displays
        mb_total = round(stats["total_bytes"] / (1024 * 1024), 1)
        self.idx_card_lbl["val1"].config(text=f"{stats['total_files']} files")
        self.idx_card_lbl["val2"].config(text=f"{mb_total} MB indexed")

        cache_mb = round(cache_metrics["used_bytes"] / (1024 * 1024), 1)
        self.cache_card_lbl["val1"].config(text=f"{cache_mb} MB used")
        self.cache_card_lbl["val2"].config(text=f"Hit Rate: {cache_metrics['hit_rate_pct']}%")

        if is_online:
            self.net_card_lbl["val1"].config(text=quality.upper(), fg="#10b981")
            self.net_card_lbl["val2"].config(text=f"RTT: {rtt} ms")
            self.status_lbl.config(text="● SYSTEM ONLINE", fg="#10b981")
        else:
            self.net_card_lbl["val1"].config(text="OFFLINE", fg="#ef4444")
            self.net_card_lbl["val2"].config(text="Local Cache Active")
            self.status_lbl.config(text="● LOCAL RESILIENCE", fg="#fbbf24")

        # Schedule next update in 4 seconds
        self.root.after(4000, self._refresh_telemetry)


def launch_desktop():
    root = tk.Tk()
    app = SmartFlowDesktopApp(root)
    root.mainloop()


if __name__ == "__main__":
    launch_desktop()
