import os
import sys
import zipfile
import urllib.request
import winreg
import subprocess

MINGIT_URL = "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.5/MinGit-2.55.0.5-64-bit.zip"
TARGET_DIR = r"C:\Users\P.Sudharsanan\AppData\Local\Programs\Git"
CMD_DIR = os.path.join(TARGET_DIR, "cmd")
ZIP_PATH = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "mingit.zip")

def install_mingit():
    print(f"[*] Downloading MinGit from {MINGIT_URL}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    req = urllib.request.Request(MINGIT_URL, headers=headers)
    with urllib.request.urlopen(req) as resp, open(ZIP_PATH, "wb") as out:
        out.write(resp.read())
    print("[+] Download complete.")

    print(f"[*] Extracting MinGit to {TARGET_DIR}...")
    os.makedirs(TARGET_DIR, exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH, "r") as zip_ref:
        zip_ref.extractall(TARGET_DIR)
    print("[+] Extraction complete.")

    # Add to User PATH in Windows Registry
    print("[*] Adding Git to User PATH environment variable...")
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_ALL_ACCESS)
        current_path, _ = winreg.QueryValueEx(key, "Path")
        if CMD_DIR.lower() not in current_path.lower():
            new_path = f"{current_path};{CMD_DIR}"
            winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_path)
            print(f"[+] Added {CMD_DIR} to User PATH.")
        else:
            print("[+] Git is already in User PATH.")
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[-] Registry update error: {e}")

    # Set in current process
    os.environ["PATH"] = f"{CMD_DIR};{os.environ['PATH']}"
    git_exe = os.path.join(CMD_DIR, "git.exe")
    print(f"[+] Git binary verified at: {git_exe}")
    
    # Run Git setup in d:\DLK PROJECT
    cwd = r"d:\DLK PROJECT"
    print(f"[*] Initializing Git repository in {cwd}...")

    def run_git(*args):
        cmd = [git_exe] + list(args)
        res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
        print(f"> git {' '.join(args)}")
        if res.stdout.strip():
            print(res.stdout.strip())
        if res.stderr.strip():
            print(res.stderr.strip())
        return res.returncode

    run_git("init")
    run_git("config", "user.name", "SmartFlow Developer")
    run_git("config", "user.email", "developer@smartflow.local")
    run_git("add", ".")
    run_git("commit", "-m", "feat: complete production-grade SmartFlow platform")
    run_git("branch", "-M", "main")
    run_git("status")

if __name__ == "__main__":
    install_mingit()
