Rust/Tauri Windows x64 release of MarkUp Viewer.

- Rendered Markdown by default, with a read-only source toggle.
- Left-hand table of contents with clickable headings and active-section highlighting.
- Tables, task lists, local raster images, and code blocks.
- Search, zoom, light/dark themes, drag-and-drop, and refresh after external saves.
- Reuses the open window when another Markdown document is launched.
- Native close button exits the application.

Downloads:

- **MarkUp-Viewer-1.0.0-x64-setup.exe**: full Windows setup with the offline WebView2 installer, Start menu entry, uninstaller, and Markdown file registration.
- **MarkUp-Viewer.exe**: standalone app; requires an installed WebView2 runtime.
- **SHA256SUMS.txt**: checksums for both downloads.

Choose MarkUp Viewer in Windows Open with and select Always to make it the default `.md` viewer. The setup installs for the current user.

Validation includes Rust rendering tests and a real WebView2 frontend check for rendered content, the TOC, source switching, navigation, and process exit. Windows x64 was built and tested; macOS and Linux need separate native builds.

This release is unsigned. Source is included in the repository; the earlier Python prototype is retained for reference.
