MarkUp Viewer — Windows builds

Current Rust version:
  rust/MarkUp-Viewer-1.1.0-x64-setup.exe — full offline Windows installer
  rust/MarkUp-Viewer-1.1.0.exe — standalone executable (WebView2 must be installed)

GitHub downloads: https://github.com/raihanewubd/MarkDownViewer/releases
Rust source and build instructions: ../source/rust-viewer

Earlier Python prototype:

Open MarkdownViewer/MarkdownViewer.exe.
Keep the entire MarkdownViewer folder together, including _internal.

Open a document with Ctrl+O, drag a file into the window, or pass a file
path to the executable. Documents display rendered by default.

Ctrl+U: toggle Markdown source
Ctrl+F: find text
Ctrl+D: toggle dark theme
Ctrl+R: reload
Ctrl++ / Ctrl+-: zoom

To open .md files by double-click, use Windows Open with and select
MarkdownViewer.exe as your preferred application.

Source code, sample document, and build instructions are in ../source.
Build separately on macOS and Linux to produce native packages.
