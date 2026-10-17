#!/usr/bin/env python3
"""Start only the installed Signalhive app; never use an existing browser profile."""
from __future__ import annotations

import fcntl
import http.server
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading


APP = Path(__file__).resolve().parent
STATE = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "signalhive-charts"
PROFILE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "signalhive-charts-browser"


def focus_existing() -> bool:
    if not shutil.which("hyprctl"):
        return False
    try:
        clients = json.loads(subprocess.check_output(["hyprctl", "clients", "-j"], timeout=3))
        for client in clients:
            if client.get("class", "").lower() in {"signalhive-charts", "signalhive charts", "io.github.maaskk.signalhivecharts"}:
                address = "address:" + client["address"]
                subprocess.run(["hyprctl", "eval", "hl.dispatch(hl.dsp.focus({window=" + json.dumps(address) + "}))"], timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP / "dist"), **kwargs)

    def log_message(self, *_args):
        pass

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


def main() -> int:
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True)
    lock = (STATE / "app.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        focus_existing()
        return 0
    native = APP / "native" / "Signalhive-Charts.AppImage"
    if native.is_file():
        env = os.environ.copy()
        env["APPIMAGE_EXTRACT_AND_RUN"] = "1"
        return subprocess.call([str(native)], env=env)
    browser = next((shutil.which(name) for name in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome") if shutil.which(name)), None)
    if not browser:
        print("Install Chromium or a native Signalhive package to open this build.", file=sys.stderr)
        return 1
    if not (APP / "dist/index.html").is_file():
        print("The installed app bundle is missing. Re-run the installer after building.", file=sys.stderr)
        return 1
    PROFILE.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 18743), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    process = None
    try:
        process = subprocess.Popen([
            browser,
            "--app=http://127.0.0.1:18743/",
            "--class=signalhive-charts",
            "--user-data-dir=" + str(PROFILE),
            "--no-first-run", "--no-default-browser-check", "--disable-background-mode",
        ])
        def stop(_signal, _frame):
            if process and process.poll() is None:
                process.terminate()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        return process.wait()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as error:
        print("Signalhive could not start: " + str(error), file=sys.stderr)
        raise SystemExit(1)
