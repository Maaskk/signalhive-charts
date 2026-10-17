"""Launch the compiled app in a real Xcode simulator and retain its initial screen."""

import json
import pathlib
import subprocess
import time

devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "--json"], text=True))
candidates = [device for runtime, entries in devices["devices"].items() if ".iOS-" in runtime for device in entries if device["name"].startswith("iPhone")]
if not candidates:
    raise SystemExit("No available iPhone simulator runtime; native launch verification cannot be skipped")
device = next((entry for entry in candidates if entry["state"] == "Booted"), candidates[0])
udid = device["udid"]
if device["state"] != "Booted":
    subprocess.run(["xcrun", "simctl", "boot", udid], check=True)
subprocess.run(["xcrun", "simctl", "bootstatus", udid, "-b"], check=True, timeout=240)
apps = [path for path in pathlib.Path("src-tauri/gen/apple").glob("build/**/Signalhive Charts.app") if ".xcarchive" not in str(path)]
if len(apps) != 1:
    raise SystemExit(f"Expected one exported app, found {apps!r}")
subprocess.run(["xcrun", "simctl", "install", udid, str(apps[0])], check=True)
subprocess.run(["xcrun", "simctl", "launch", "--terminate-running-process", udid, "io.github.maaskk.signalhivecharts"], check=True)
time.sleep(3)
subprocess.run(["xcrun", "simctl", "io", udid, "screenshot", "artifacts/ios-simulator-smoke.png"], check=True)
print(f"Installed and launched native iOS app in {device['name']}; screenshot retained for visual review.")
