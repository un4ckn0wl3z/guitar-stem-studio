"""CI smoke test for the packaged app: start it, check the UI and API respond, stop it."""
import os
import subprocess
import sys
import tempfile
import time
import urllib.request

exe = sys.argv[1]
env = dict(os.environ, GS_NO_BROWSER="1", GS_PORT="18799", GS_DATA_DIR=tempfile.mkdtemp())
proc = subprocess.Popen([exe], env=env)
try:
    for _ in range(180):
        try:
            with urllib.request.urlopen("http://127.0.0.1:18799/", timeout=2) as r:
                assert r.status == 200 and b"Guitar Stem Studio" in r.read()
            with urllib.request.urlopen("http://127.0.0.1:18799/api/jobs", timeout=2) as r:
                assert r.status == 200
            with urllib.request.urlopen("http://127.0.0.1:18799/static/i18n.js", timeout=2) as r:
                assert r.status == 200
            print("smoke test OK")
            break
        except Exception:
            if proc.poll() is not None:
                sys.exit(f"app exited early with code {proc.returncode}")
            time.sleep(1)
    else:
        sys.exit("app did not start within 180 s")
finally:
    proc.terminate()
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()
