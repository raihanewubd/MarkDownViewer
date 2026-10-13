# MarkUp Viewer

A desktop Markdown reader built with **Rust and Tauri**. Open a `.md` file and read the formatted document immediately. Use the left-hand table of contents to jump between headings, or switch to read-only Markdown source when needed.

## Download and install

Download **MarkUp-Viewer-1.1.0-x64-setup.exe** from [Releases](https://github.com/raihanewubd/MarkDownViewer/releases). The Windows setup installs the app, Start menu entry, uninstaller, Markdown file-type registration, and WebView2 if missing. The offline setup includes the WebView2 runtime installer.

After installation, choose MarkUp Viewer in Windows **Open with**, then select **Always** to make it the default app for `.md` files. Windows controls the final default-app choice.

The standalone executable is also available in Releases. It requires the Microsoft Edge WebView2 runtime already installed, which is normally present on current Windows 10/11 systems. Use the setup file when unsure.

## Features

- Formatted reading by default; optional read-only source view.
- Multiple document tabs, each showing the full path and filename. Reopening a file selects its existing tab. Each tab retains its source/reading mode, search, and scroll position.
- Clickable, indented table of contents with active-section highlighting.
- Headings, tables, code blocks, task lists, strikethrough, and local raster images.
- Open dialog, drag-and-drop, and double-click file opening.
- Reuse the existing app window when opening another document.
- Light/dark themes, adjustable text zoom, and document search.
- Refresh after external saves while preserving the current view.
- Native title-bar close exits the app; no background tray process.
- Close a tab with its × button or Ctrl+W; cycle tabs using Ctrl+Tab and Ctrl+Shift+Tab.
- Raw HTML and executable links in Markdown cannot run code in the viewer.

## Source and building

The current Rust application is in [`source/rust`](source/rust). See its [build instructions](source/rust/README.md). The earlier Python prototype and its [build instructions](source/python/README.md) are in [`source/python`](source/python).

The code supports Windows, macOS, and Linux, but each platform needs its own native build and development prerequisites. The downloadable build is Windows x64.

Documents must be UTF-8 text, up to 20 MB. Local PNG, JPEG, GIF, WebP, BMP, and ICO images are supported, up to 10 MB per image. Mermaid, math typesetting, raw HTML rendering, and document editing are not included in this release.
