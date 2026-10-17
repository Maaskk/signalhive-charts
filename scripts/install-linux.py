#!/usr/bin/env python3
"""Install a user-local app menu entry and a private, independent app bundle."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def desktop_quote(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$') + '"'


def main():
    if sys.platform != 'linux':
        raise SystemExit('This installer is for Linux. Use native platform releases elsewhere.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native', type=Path, help='Optional verified Signalhive AppImage to install')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if not (root / 'dist/index.html').is_file():
        raise SystemExit('Run npm ci && npm run build first.')
    if args.native and (not args.native.is_file() or args.native.is_symlink()):
        raise SystemExit('Supply a regular verified AppImage file.')
    base = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
    target = base / 'signalhive-charts'
    bindir = Path.home() / '.local/bin'
    applications = base / 'applications'
    target.mkdir(parents=True, exist_ok=True)
    bindir.mkdir(parents=True, exist_ok=True)
    applications.mkdir(parents=True, exist_ok=True)
    # Replace only this app's installed static assets; never touch its saved data.
    if (target / 'dist').is_dir():
        shutil.rmtree(target / 'dist')
    shutil.copytree(root / 'dist', target / 'dist')
    shutil.copy2(root / 'desktop/launcher.py', target / 'launcher.py')
    shutil.copy2(root / 'public/icon.svg', target / 'icon.svg')
    if args.native:
        (target / 'native').mkdir(exist_ok=True)
        shutil.copy2(args.native, target / 'native/Signalhive-Charts.AppImage')
        (target / 'native/Signalhive-Charts.AppImage').chmod(0o755)
    launcher = bindir / 'signalhive-charts'
    if launcher.is_symlink() or launcher.exists():
        launcher.unlink()
    launcher.symlink_to(target / 'launcher.py')
    (target / 'launcher.py').chmod(0o755)
    entry = applications / 'signalhive-charts.desktop'
    entry.write_text('[Desktop Entry]\nType=Application\nName=Signalhive Charts\nComment=Charts, drawing tools and virtual paper trading\nExec=' + desktop_quote(launcher) + '\nIcon=' + str(target / 'icon.svg') + '\nTerminal=false\nCategories=Office;Finance;\nStartupWMClass=signalhive-charts\n')
    entry.chmod(0o644)
    if shutil.which('update-desktop-database'):
        subprocess.run(['update-desktop-database', str(applications)], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('Installed Signalhive Charts in the application menu.')
    print('Native AppImage' if args.native else 'Bundled app preview using a dedicated Chromium window; the local server stops when the window closes.')


if __name__ == '__main__':
    main()
