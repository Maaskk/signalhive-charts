# Platform packages

Signalhive Charts uses a shared responsive frontend, with a Tauri 2 native wrapper. The [build guide](../src-tauri/BUILDING.md) contains the reproducible commands, prerequisites, CI matrix and signing details.

The web/PWA interface is tested with desktop Chromium and Android-sized touch emulation. A successful native CI compile confirms packaging, not complete real-device testing. Native WebView file import/export, touch, external links and window behavior must also be checked on each actual operating system. Browser installation is available as an alternative where native preview behavior differs.

Preview targets:

- Windows x64 NSIS installer, unsigned.
- macOS Intel and Apple Silicon DMG/app bundles, ad-hoc signed and not notarized.
- Linux x64 Debian package and AppImage. The system's WebKit/runtime requirements still apply.
- Android ARM64 development/debug APK, not a Play Store release. Export local data before replacing or uninstalling a debug build.
- Static web ZIP/PWA, usable through an HTTP server or GitHub Pages on supported browsers.

See the actual release assets and workflow status for available downloads. No credentials or developer signing keys are bundled.
