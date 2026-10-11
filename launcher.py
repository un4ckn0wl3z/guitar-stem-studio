"""Entry point for the packaged (PyInstaller) app: pick a data folder and a free port,
start the server and open the browser."""
from __future__ import annotations

import multiprocessing
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

APP = "GuitarStemStudio"


def data_root() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / APP


def free_port(preferred: int) -> int:
    for port in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return 0


def main():
    multiprocessing.freeze_support()
    root = data_root()
    os.environ.setdefault("GS_DATA_DIR", str(root / "jobs"))
    os.environ.setdefault("TORCH_HOME", str(root / "models"))  # Demucs weights are cached here

    bundle = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
    deno = bundle / "bin" / ("deno.exe" if sys.platform == "win32" else "deno")
    if deno.exists():
        os.environ.setdefault("GS_DENO", str(deno))

    host = os.environ.get("GS_HOST", "127.0.0.1")
    port = int(os.environ.get("GS_PORT") or free_port(8000))
    url = f"http://{'localhost' if host in ('127.0.0.1', '0.0.0.0') else host}:{port}"

    print("=" * 56)
    print("  Guitar Stem Studio")
    print(f"  Open: {url}")
    print(f"  Songs are stored in: {os.environ['GS_DATA_DIR']}")
    print("  Close this window to quit.")
    print("=" * 56, flush=True)

    import uvicorn
    from app import app  # imported after env vars are set

    if not os.environ.get("GS_NO_BROWSER"):
        threading.Thread(target=lambda: (time.sleep(1.5), webbrowser.open(url)), daemon=True).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
