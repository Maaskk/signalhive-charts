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

| Platform | Output |
| --- | --- |
| Linux x64 | AppImage and Debian package |
| Windows x64 | NSIS installer |
| macOS Intel | App bundle and DMG, x86_64 target |
| macOS Apple Silicon | App bundle and DMG, aarch64 target |
| Android ARM64 | Clearly named installable **DEBUG APK** |

The native jobs use the committed npm lockfile, exact Tauri crate versions and Rust stable (the crates require Rust 1.90 or later). The first native build generates `Cargo.lock`; CI retains that lockfile as an artifact so it can be reviewed and committed for subsequent dependency reproducibility. It must not be confused with a successful local compile.

Desktop outputs have no paid publisher certificates. macOS receives only an ad-hoc signature and is not notarized; macOS and Windows may warn or restrict installation. Release signing/notarization requires separately configured developer accounts and credentials, which are not part of this repository.

The Android job initializes a fresh project noninteractively with the installed Tauri CLI, installs the SDK platform named by that generated project and builds only the ARM64 ABI. It uses Android's test/debug signing, verifies the APK and labels the asset **DEBUG**. It is not a production-signed release or Play Store package. Hosted runners may produce a different debug key on subsequent runs, so replacing an older debug installation can require uninstalling it. Export workspaces first; uninstalling clears that app's local storage.

## Official references

- [Tauri GitHub build workflow](https://v2.tauri.app/distribute/pipelines/github/)
- [Tauri configuration](https://v2.tauri.app/reference/config/)
- [Native and Android prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Capabilities and permissions](https://v2.tauri.app/security/capabilities/)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
