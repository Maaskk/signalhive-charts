#!/usr/bin/env python3
"""Start only the installed Signalhive app; never use an existing browser profile."""
from __future__ import annotations

import fcntl
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import stat
import time


APP = Path(__file__).resolve().parent
STATE = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "signalhive-charts"
PROFILE = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "signalhive-charts-browser"
BRIDGE_CONFIG = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "signalhive-charts/bridge.json"
ALLOWED_ORIGINS = {"http://127.0.0.1:18743", "http://localhost:18743", "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"}


def private_json(path: Path, maximum=2_000_000, normalize_snapshot=False):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_size > maximum:
            raise ValueError("Unsafe private adapter file")
        if stat.S_IMODE(info.st_mode) & 0o077:
            parent=path.parent.stat()
            if not normalize_snapshot or parent.st_uid!=os.getuid() or stat.S_IMODE(parent.st_mode)&0o077:
                raise ValueError("Unsafe private adapter file")
            os.fchmod(stream.fileno(),0o600)
        return json.load(stream)


def bridge_config():
    try:
        config = private_json(BRIDGE_CONFIG, 16384)
        if config.get("version") != 1 or not isinstance(config.get("snapshotPath"), str) or not Path(config["snapshotPath"]).is_absolute():
            return None
        return config
    except (OSError, ValueError, TypeError):
        return None


def focus_existing() -> bool:
    if not shutil.which("hyprctl"):
        return False
    try:
        clients = json.loads(subprocess.check_output(["hyprctl", "clients", "-j"], timeout=3))
        for client in clients:
            if client.get("class", "").lower() in {"signalhive-charts", "signalhive charts", "io.github.maaskk.signalhivecharts", "chrome-127.0.0.1__-default"}:
                address = "address:" + client["address"]
                subprocess.run(["hyprctl", "eval", "hl.dispatch(hl.dsp.focus({window=" + json.dumps(address) + "}))"], timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?',1)[0] != '/api/mt5':
            return super().do_GET()
        origin = self.headers.get('Origin')
        if self.headers.get('Host') not in {'127.0.0.1:18743','localhost:18743'} or (origin and origin not in ALLOWED_ORIGINS):
            self.send_error(403)
            return
        try:
            config = bridge_config()
            if not config:
                raise ValueError('No local adapter configured')
            data = private_json(Path(config['snapshotPath']),normalize_snapshot=True)
            permitted = {'version','source','capturedAt','connected','demo','symbol','timeframe','candles','quote','spec','account','error'}
            if not isinstance(data,dict) or data.get('version') != 1 or data.get('source') != 'mt5' or set(data) - permitted:
                raise ValueError('Unsupported adapter output')
            if data.get('connected') and data.get('demo') is not True:
                raise ValueError('Adapter is restricted to demo accounts')
            body = json.dumps(data, allow_nan=False).encode()
            status = 200
        except (OSError,ValueError,KeyError,TypeError):
            body = json.dumps({'version':1,'source':'mt5','capturedAt':int(time.time()),'connected':False,'error':'snapshot_unavailable'}).encode()
            status = 503
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin',origin)
            self.send_header('Vary','Origin')
        self.end_headers()
        self.wfile.write(body)

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
    browser = next((shutil.which(name) for name in ("chromium", "chromium-browser", "google-chrome-stable", "google-chrome") if shutil.which(name)), None)
    if not browser and not native.is_file():
        print("Install Chromium or a native Signalhive package to open this build.", file=sys.stderr)
        return 1
    if not (APP / "dist/index.html").is_file():
        print("The installed app bundle is missing. Re-run the installer after building.", file=sys.stderr)
        return 1
    PROFILE.mkdir(parents=True, exist_ok=True)
    # Avoid an older service worker's cached entry page after an app update.
    # The origin and saved browser data remain unchanged.
    build_id = hashlib.sha256((APP / 'dist/index.html').read_bytes()).hexdigest()[:12]
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 18743), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    process = None
    exporter = None
    try:
        config=bridge_config()
        if config and isinstance(config.get('stopPath'),str):
            Path(config['stopPath']).unlink(missing_ok=True)
        if config and (APP / 'wine_bridge.py').is_file():
            exporter = subprocess.Popen([sys.executable,str(APP/'wine_bridge.py'),'--config',str(BRIDGE_CONFIG)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if native.is_file():
            env = os.environ.copy()
            env['APPIMAGE_EXTRACT_AND_RUN'] = '1'
            process = subprocess.Popen([str(native)],env=env)
        else:
            process = subprocess.Popen([
            browser,
            "--app=http://127.0.0.1:18743/?build=" + build_id,
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
        if exporter and exporter.poll() is None:
            if config and isinstance(config.get('stopPath'),str):
                fd=os.open(config['stopPath'],os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
                os.close(fd)
            try: exporter.wait(timeout=5)
            except subprocess.TimeoutExpired:
                exporter.terminate()
                try: exporter.wait(timeout=3)
                except subprocess.TimeoutExpired: exporter.kill()
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as error:
        print("Signalhive could not start: " + str(error), file=sys.stderr)
        raise SystemExit(1)
