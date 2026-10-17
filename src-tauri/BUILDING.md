# Native packaging

This is a thin Tauri 2 wrapper around the bundled charting frontend. There are no custom Rust commands, native plugins, filesystem/shell permissions, broker connections or signing credentials. Browser file inputs and local browser storage remain frontend features. Release builds embed `../dist`; the development server uses `127.0.0.1:1420`.

The native source/configuration and icons can be checked locally with:

```sh
node .github/scripts/validate-native.mjs
npm run tauri -- --version
```

A native compilation requires Rust and the platform's Tauri prerequisites. This workspace initially has no configured Rust toolchain, Linux WebKit development libraries or Android SDK, so configuring these files does **not** establish a tested native build. The hosted release workflow performs the actual builds. Its logs and assets determine which targets succeeded.

## CI outputs

`.github/workflows/quality-pages.yml` runs the unit suite, validates wrapper metadata and builds the frontend. Pull requests receive a build artifact; successful main-branch runs deploy through GitHub Pages once the repository's Pages source is set to GitHub Actions.

`.github/workflows/release.yml` runs on version tags such as `v0.1.0` or a manual dispatch. The tag must match `package.json`, `Cargo.toml` and `tauri.conf.json`. It first reruns tests/build, creates a preview release and then builds these independent jobs:

| Platform            | Output                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Linux x64           | AppImage and Debian package                                        |
| Windows x64         | NSIS installer                                                     |
| macOS Intel         | App bundle and DMG, x86_64 target                                  |
| macOS Apple Silicon | App bundle and DMG, aarch64 target                                 |
| Android ARM64       | Clearly named installable **DEBUG APK**                            |
| iOS ARM64 simulator | Clearly named **SIMULATOR ONLY** `.app` zip for Apple Silicon Macs |

The native jobs use the committed npm and Cargo lockfiles, exact Tauri crate versions and Rust stable (the crates require Rust 1.90 or later). `Cargo.lock` was recovered from the successful first macOS ARM64 hosted build, reviewed and committed. Subsequent builds pass Cargo's `--locked` flag and retain the lockfile as a workflow artifact. This hosted compilation must not be confused with a successful local compile.

Desktop outputs have no paid publisher certificates. macOS receives only an ad-hoc signature and is not notarized; macOS and Windows may warn or restrict installation. Release signing/notarization requires separately configured developer accounts and credentials, which are not part of this repository.

The Android job initializes a fresh project noninteractively with the installed Tauri CLI, installs the SDK platform named by that generated project and builds only the ARM64 ABI. It uses Android's test/debug signing, verifies the APK and labels the asset **DEBUG**. It is not a production-signed release or Play Store package. Hosted runners may produce a different debug key on subsequent runs, so replacing an older debug installation can require uninstalling it. Export workspaces first; uninstalling clears that app's local storage.

The iOS job runs on an Apple Silicon macOS runner with Xcode. It initializes the Xcode project, compiles `aarch64-apple-ios-sim` without signing and checks the resulting bundle identifier, simulator platform and Mach-O ARM64 architecture before creating the zip. It then installs and launches the app in an available iPhone simulator, retaining a screenshot as a workflow artifact for visual review. A successful launch is a smoke check, not an end-to-end test of all drawing/import/export flows. This is a native iOS app bundle for the **simulator**, not an iPhone-installable IPA. The workflow cannot produce an App Store or TestFlight release without separately supplied Apple credentials and provisioning. There is no fictitious development-team ID in the public configuration.

To use a successfully built simulator artifact on an Apple Silicon Mac with Xcode, unzip it and drag `Signalhive Charts.app` onto a booted iPhone simulator, or run:

```sh
xcrun simctl install booted '/path/to/Signalhive Charts.app'
xcrun simctl launch booted io.github.maaskk.signalhivecharts
```

For a physical iPhone development build, a maintainer needs a Mac with Xcode, an Apple account configured in Xcode, a valid development team and the device's provisioning. Open the generated project with `npm run tauri -- ios dev --open`, select the account/team in Xcode and build for the connected device. App Store/TestFlight distribution additionally requires the appropriate Apple Developer Program membership and distribution signing. Keep signing keys and provisioning files in private CI secrets, never in this public repository.

Both mobile packages embed the frontend assets locally. Desktop and mobile use the same analysis and virtual paper ledger; they do not wrap the published GitHub Pages website and do not connect to an MT5 account. The initial wrapper deliberately has no native plugins or broad filesystem permissions. File import, workspace export and browser external-link handling still need platform runtime checks; frontend browser tests alone are not evidence of native mobile behavior.

The iOS deployment target is 16.0. The frontend uses ES2022 and modern WebKit APIs, including `Object.hasOwn` and `structuredClone` ([introduced in Safari/iOS 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)). Requiring iOS 16 avoids advertising support for the earlier iOS 15.0 WebKit runtime; it does not replace testing on the oldest supported OS.

## Official references

- [Tauri GitHub build workflow](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri configuration](https://v2.tauri.app/reference/config/)
- [Native and Android prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Capabilities and permissions](https://v2.tauri.app/security/capabilities/)
- [iOS build CLI](https://v2.tauri.app/reference/cli/#ios-build)
- [iOS signing and distribution requirements](https://v2.tauri.app/distribute/sign/ios/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
