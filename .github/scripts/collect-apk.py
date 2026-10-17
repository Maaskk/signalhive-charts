"""Collect only a built debug APK; this script never generates production keys."""
from pathlib import Path
import os
import re
import shutil
import subprocess

tag = os.environ['RELEASE_TAG']
if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', tag):
    raise SystemExit('Invalid release tag')
candidates = list(Path('src-tauri/gen/android/app/build/outputs/apk').rglob('*-debug.apk'))
if len(candidates) != 1:
    raise SystemExit(f'Expected one ARM64 debug APK, found {len(candidates)}')
signers = sorted(Path(os.environ['ANDROID_HOME']).glob('build-tools/*/apksigner'))
if not signers:
    raise SystemExit('Android apksigner is missing')
subprocess.run([str(signers[-1]), 'verify', str(candidates[0])], check=True)
destination = Path('artifacts') / f'signalhive-charts_{tag}_android-arm64_DEBUG.apk'
destination.parent.mkdir(exist_ok=True)
shutil.copy2(candidates[0], destination)
print(f'Verified installable DEBUG APK: {destination}')
