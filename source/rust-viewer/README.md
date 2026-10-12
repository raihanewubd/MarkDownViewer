# Rust application

The desktop shell, file loading, Markdown parser, sanitization, link handling, and refresh logic are written in Rust. The embedded frontend is plain HTML/CSS/JavaScript without an external website or frontend framework. Windows uses the system WebView2 runtime instead of bundling Python, Qt, or Chromium.

## Windows prerequisites

- Rust stable with the `x86_64-pc-windows-msvc` toolchain.
- Microsoft Visual Studio C++ Build Tools and Windows SDK.
- Node.js and npm for the Tauri build CLI.
- Microsoft Edge WebView2 for running the app during development.

See https://tauri.app/start/prerequisites/ for platform requirements.

## Develop

Run from this directory:

    npm ci
    npm run dev

## Verify

    cargo test --manifest-path src-tauri/Cargo.toml
    node --check web/app.js

The executable has an integration test mode:

    markup-viewer.exe --self-test ABSOLUTE_REPORT_PATH ABSOLUTE_SAMPLE_PATH

Use `../sample.md` as the sample file. It initializes the real WebView2 frontend, renders the sample, verifies the TOC, source toggle and navigation, writes a JSON report, and closes the window. Verify both a passing report and successful process exit. The test window remains hidden. The Windows helper `scripts/verify.ps1 -Executable ABSOLUTE_EXE_PATH` performs this check and measures elapsed time.

## Create the full Windows setup

    npm run build

This creates the release executable in `src-tauri/target/release/` and an NSIS setup executable in `src-tauri/target/release/bundle/nsis/`. The installer includes the offline WebView2 runtime installer, so it is larger than the standalone application. This affects setup size, not the app's normal rendering process. Installation is for the current user. Tauri downloads installer tools automatically while building.

On Windows, `scripts/build.ps1` performs dependency installation, Rust tests, setup creation, copies both executables into the project's `output/rust` folder, and verifies the finished application.

Regenerate platform icons, if the SVG icon changes:

    npm run icons

Keep Cargo.lock and package-lock.json in version control for reproducible dependency versions. Build separately on macOS/Linux with their native prerequisites and override bundle targets, for example `npx tauri build --bundles dmg`. NSIS is the default Windows target.

## Layout

- `src-tauri/src/document.rs`: Markdown rendering, sanitization, local images, unit tests.
- `src-tauri/src/main.rs`: desktop lifecycle, single instance, commands, file handling.
- `web/`: reading interface, TOC, themes, search, shortcuts.
- `src-tauri/tauri.conf.json`: runtime, application, file associations, setup configuration.
- `src-tauri/installer-hooks.nsh`: quotes executable paths in Windows file-opening commands so paths containing spaces are handled correctly.

External HTTP/HTTPS and mail links open through the OS. Local links can open only Markdown documents. Source is read-only. No analytics, network API, or account is required to read local files; remote document images and external links may use the internet.
