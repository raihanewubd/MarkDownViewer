# Markdown Viewer

A cross-platform Python/PySide6 desktop viewer. Documents open rendered by default; View Source reveals read-only Markdown. Supports tables, strikethrough, local images, drag-and-drop, search, zoom, themes, and automatic refresh after external edits.

The left Contents panel lists the open document's headings in a hierarchy. Click a heading to jump to it in rendered view. It refreshes with external edits and supports repeated headings, Setext headings, and skipped heading levels. Hide or restore it using View > Contents. Closing the window stops reload monitoring and exits the application.

The native Qt document renderer avoids a bundled browser engine. It supports common Markdown formatting but does not implement browser CSS, JavaScript, Mermaid, or mathematical typesetting. Embedded raw HTML is displayed as text. External HTTP/HTTPS and mail links open in the default application; other local file types cannot be launched from document links.

## Run

Install Python, create a virtual environment, then run:

    python -m pip install -r requirements.txt
    python main.py sample.md

## Build

    python build.py

The application is placed in `../../output/MarkdownViewer`. Keep the executable and its companion `_internal` folder together. Build separately on Windows, macOS, and Linux using that OS; a Windows executable is not a cross-platform binary.

Windows builds restrict DLL discovery to Python and Windows directories to prevent unrelated applications on PATH from supplying incompatible DLLs. Windows 10/11 supplies the system ICU library used by Qt.

To verify the packaged Windows executable, run it with `--self-test REPORT_PATH SAMPLE_PATH`, passing absolute paths to a writable JSON report and this project's sample.md. It exits after rendering the sample and writes a success report plus a PNG preview. Absence of that report is a failed startup check.

Alternatively run `python verify_build.py` on Windows. This checks the executable with a minimal PATH and no Python or Qt environment overrides. Close running viewer instances before rebuilding; old packages are preserved inside source/build when replaced.

## Windows file association

Right-click a `.md` file, choose Open with, select MarkdownViewer.exe, and choose Always. This choice is made by the user; the application does not modify system file associations automatically.

The viewer does not edit or save document content. UTF-8 (including UTF-8 BOM) files are supported. Local images resolve relative to the document's directory.
