"""Validate an actual Tauri iOS-simulator bundle and archive it without claiming iPhone support."""

import json
import pathlib
import plistlib
import subprocess

project = pathlib.Path("src-tauri/gen/apple")
apps = [path for path in project.glob("build/**/Signalhive Charts.app") if ".xcarchive" not in str(path)]
if len(apps) != 1:
    raise SystemExit(f"Expected one exported simulator application, found {apps!r}")
app = apps[0]
with (app / "Info.plist").open("rb") as handle:
    info = plistlib.load(handle)
if info.get("CFBundleIdentifier") != "io.github.maaskk.signalhivecharts":
    raise SystemExit("Unexpected bundle identifier")
if "iPhoneSimulator" not in info.get("CFBundleSupportedPlatforms", []):
    raise SystemExit("Bundle is not an iOS simulator application")
binary = app / info["CFBundleExecutable"]
architectures = subprocess.check_output(["lipo", "-archs", str(binary)], text=True).split()
if architectures != ["arm64"]:
    raise SystemExit(f"Expected ARM64 simulator binary, got {architectures!r}")
version = json.loads(pathlib.Path("package.json").read_text())["version"]
output = pathlib.Path("artifacts")
output.mkdir(exist_ok=True)
archive = output / f"Signalhive_Charts_{version}_iOS_ARM64_SIMULATOR_ONLY.zip"
subprocess.run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(app), str(archive)], check=True)
print(f"Verified ARM64 iOS simulator bundle; physical iPhones cannot install {archive.name}.")
