"""Cross-platform, read-only Markdown viewer."""
import sys
import os
import json
from pathlib import Path

if "--self-test" in sys.argv:
    os.environ["QT_QPA_PLATFORM"] = "offscreen"

def record_test_failure():
    import traceback
    Path(sys.argv[2]).with_suffix(".error.txt").write_text(traceback.format_exc(), encoding="utf-8")


try:
    from markdown_it import MarkdownIt
    from PySide6.QtCore import QFileSystemWatcher, QSettings, QTimer, QUrl, Qt
    from PySide6.QtGui import QAction, QDesktopServices, QFont, QKeySequence
    from PySide6.QtWidgets import (
        QApplication, QFileDialog, QInputDialog, QMainWindow, QMessageBox,
        QPlainTextEdit, QStackedWidget, QTextBrowser, QToolBar,
        QDockWidget, QTreeWidget, QTreeWidgetItem,
    )
except Exception:
    if len(sys.argv) > 2 and sys.argv[1] == "--self-test":
        record_test_failure()
        sys.exit(1)
    raise


PARSER = MarkdownIt("commonmark", {"html": False, "linkify": False}).enable("table").enable("strikethrough")


def render(text):
    return render_document(text)[0]


def render_document(text):
    from markdown_it.token import Token
    tokens = PARSER.parse(text)
    headings = []
    for index, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        inline = tokens[index + 1]
        label = "".join(
            " " if child.type in {"softbreak", "hardbreak"} else child.content
            for child in inline.children or []
            if child.type in {"text", "code_inline", "image", "softbreak", "hardbreak"}
        ).strip()
        anchor = f"section-{len(headings)}"
        marker = Token("html_inline", "", 0)
        marker.content = f'<a name="{anchor}"></a>'
        inline.children.insert(0, marker)
        headings.append((int(token.tag[1]), label or "Untitled heading", anchor))
    return PARSER.renderer.render(tokens, PARSER.options, {}), headings


class Viewer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings = QSettings("MarkUp", "MarkdownViewer")
        self.path = None
        self.text = ""
        self.dark = self.settings.value("dark", False, type=bool)
        self.setWindowTitle("Markdown Viewer")
        self.resize(1000, 760)
        self.setAcceptDrops(True)
        self.preview = QTextBrowser()
        self.preview.setOpenLinks(False)
        self.preview.anchorClicked.connect(self.open_link)
        self.preview.setFont(QFont("Segoe UI", 12))
        self.source = QPlainTextEdit()
        self.source.setReadOnly(True)
        self.source.setFont(QFont("Consolas", 11))
        self.pages = QStackedWidget()
        self.pages.addWidget(self.preview)
        self.pages.addWidget(self.source)
        self.setCentralWidget(self.pages)
        self.toc = QTreeWidget()
        self.toc.setHeaderHidden(True)
        self.toc.setIndentation(16)
        self.toc.setMinimumWidth(180)
        self.toc.itemClicked.connect(self.navigate_heading)
        self.toc_dock = QDockWidget("Contents", self)
        self.toc_dock.setObjectName("contents")
        self.toc_dock.setAllowedAreas(Qt.DockWidgetArea.LeftDockWidgetArea | Qt.DockWidgetArea.RightDockWidgetArea)
        self.toc_dock.setFeatures(QDockWidget.DockWidgetFeature.DockWidgetClosable)
        self.toc_dock.setWidget(self.toc)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, self.toc_dock)
        self.resizeDocks([self.toc_dock], [240], Qt.Orientation.Horizontal)
        toolbar = QToolBar("Reading controls")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        file_menu = self.menuBar().addMenu("File")
        view_menu = self.menuBar().addMenu("View")
        view_menu.addAction(self.toc_dock.toggleViewAction())
        self.action("Open…", self.choose_file, "Ctrl+O", toolbar, file_menu)
        self.source_action = self.action("View Source", self.toggle_source, "Ctrl+U", toolbar, view_menu, True)
        self.action("Find…", self.find_text, "Ctrl+F", toolbar, view_menu)
        self.action("Zoom in", lambda: self.zoom(1), "Ctrl++", toolbar, view_menu)
        self.action("Zoom out", lambda: self.zoom(-1), "Ctrl+-", toolbar, view_menu)
        self.theme_action = self.action("Dark theme", self.toggle_theme, "Ctrl+D", toolbar, view_menu, True)
        self.theme_action.setChecked(self.dark)
        self.action("Reload", self.reload, "Ctrl+R", toolbar, file_menu)
        self.action("Exit", self.close, "Ctrl+Q", None, file_menu)
        self.watcher = QFileSystemWatcher(self)
        self.refresh_timer = QTimer(self)
        self.refresh_timer.setSingleShot(True)
        self.refresh_timer.setInterval(250)
        self.refresh_timer.timeout.connect(self.reload)
        self.watcher.fileChanged.connect(lambda _: self.refresh_timer.start())
        self.watcher.directoryChanged.connect(lambda _: self.refresh_timer.start())
        self.apply_theme()
        self.preview.setHtml("<h1>Markdown Viewer</h1><p>Open a Markdown file or drag it into this window.</p><p>Use <b>View Source</b> to see the original Markdown.</p>")
        self.statusBar().showMessage("Ready • Ctrl+O to open a file")

    def action(self, label, callback, shortcut, toolbar, menu, checkable=False):
        action = QAction(label, self)
        action.setShortcut(QKeySequence(shortcut))
        action.setCheckable(checkable)
        action.triggered.connect(callback)
        menu.addAction(action)
        if toolbar:
            toolbar.addAction(action)
        return action

    def choose_file(self):
        filename, _ = QFileDialog.getOpenFileName(self, "Open Markdown", self.settings.value("directory", ""), "Markdown (*.md *.markdown *.mdown);;All files (*)")
        if filename:
            self.load_file(Path(filename))

    def load_file(self, path):
        try:
            text = path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError) as exc:
            QMessageBox.warning(self, "Cannot open file", str(exc))
            return
        self.path = path.resolve()
        self.text = text
        self.settings.setValue("directory", str(self.path.parent))
        self.source.setPlainText(text)
        self.update_preview()
        self.source_action.setChecked(False)
        self.toggle_source(False)
        self.setWindowTitle(f"{self.path.name} — Markdown Viewer")
        for paths in (self.watcher.files(), self.watcher.directories()):
            if paths:
                self.watcher.removePaths(paths)
        self.watcher.addPaths([str(self.path), str(self.path.parent)])
        self.statusBar().showMessage(str(self.path))

    def update_preview(self):
        position = self.preview.verticalScrollBar().value()
        if self.path:
            self.preview.document().setBaseUrl(QUrl.fromLocalFile(str(self.path.parent) + "/"))
        color = "#8ab4f8" if self.dark else "#175cd3"
        self.preview.document().setDefaultStyleSheet(
            f"a {{ color: {color}; }} pre, code {{ font-family: Consolas, monospace; }}"
            "h1, h2, h3 { margin-top: 20px; } td, th { padding: 7px; }"
        )
        html, headings = render_document(self.text)
        self.preview.setHtml(html)
        self.toc.clear()
        parents = []
        for level, label, anchor in headings:
            while parents and parents[-1][0] >= level:
                parents.pop()
            item = QTreeWidgetItem([label])
            item.setData(0, Qt.ItemDataRole.UserRole, anchor)
            item.setToolTip(0, label)
            if parents:
                parents[-1][1].addChild(item)
            else:
                self.toc.addTopLevelItem(item)
            parents.append((level, item))
        if not headings:
            item = QTreeWidgetItem(["No headings in this document"])
            item.setDisabled(True)
            self.toc.addTopLevelItem(item)
        self.toc.expandAll()
        self.preview.verticalScrollBar().setValue(position)

    def navigate_heading(self, item, column=0):
        anchor = item.data(0, Qt.ItemDataRole.UserRole)
        if anchor:
            self.source_action.setChecked(False)
            self.toggle_source(False)
            self.preview.scrollToAnchor(anchor)

    def closeEvent(self, event):
        # Stop pending reloads before accepting the native title-bar close.
        self.refresh_timer.stop()
        self.watcher.blockSignals(True)
        paths = self.watcher.files() + self.watcher.directories()
        if paths:
            self.watcher.removePaths(paths)
        event.accept()
        QApplication.instance().quit()

    def reload(self):
        if not self.path:
            return
        try:
            text = self.path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError):
            self.statusBar().showMessage("File unavailable; keeping the last rendered version")
            return
        if str(self.path) not in self.watcher.files():
            self.watcher.addPath(str(self.path))
        if text != self.text:
            self.text = text
            position = self.source.verticalScrollBar().value()
            self.source.setPlainText(text)
            self.source.verticalScrollBar().setValue(position)
            self.update_preview()
        self.statusBar().showMessage(str(self.path))

    def toggle_source(self, checked):
        self.pages.setCurrentIndex(1 if checked else 0)

    def toggle_theme(self, checked):
        self.dark = checked
        self.settings.setValue("dark", checked)
        self.apply_theme()
        if self.path:
            self.update_preview()

    def apply_theme(self):
        bg, fg, panel = ("#171b22", "#e6eaf0", "#242b36") if self.dark else ("#ffffff", "#202733", "#f0f3f8")
        self.setStyleSheet(f"QMainWindow, QMenuBar, QMenu, QToolBar, QStatusBar, QDockWidget {{ background: {panel}; color: {fg}; }} QTreeWidget {{ background: {panel}; color: {fg}; border: none; padding: 8px; }} QTreeWidget::item {{ padding: 5px; }} QTreeWidget::item:selected {{ background: #3768b5; color: white; }} QTextBrowser, QPlainTextEdit {{ background: {bg}; color: {fg}; border: none; padding: 24px; selection-background-color: #3768b5; }} QToolButton {{ color: {fg}; padding: 7px; }} QToolButton:checked {{ background: #3768b5; color: white; }}")

    def zoom(self, amount):
        self.preview.zoomIn(amount)
        self.source.zoomIn(amount)

    def find_text(self):
        query, accepted = QInputDialog.getText(self, "Find", "Text to find:")
        if accepted and query:
            widget = self.pages.currentWidget()
            if not widget.find(query):
                cursor = widget.textCursor()
                cursor.movePosition(cursor.MoveOperation.Start)
                widget.setTextCursor(cursor)
                if not widget.find(query):
                    self.statusBar().showMessage(f"No matches for: {query}")

    def open_link(self, url):
        if url.toString().startswith("#"):
            self.preview.scrollToAnchor(url.fragment())
            return
        if url.isRelative() and self.path:
            url = QUrl.fromLocalFile(str(self.path.parent) + "/").resolved(url)
        if url.isLocalFile():
            path = Path(url.toLocalFile())
            if path.suffix.lower() in {".md", ".markdown", ".mdown"}:
                self.load_file(path)
            else:
                self.statusBar().showMessage("Only Markdown file links can be opened from a document")
        elif url.scheme() in {"https", "http", "mailto"}:
            QDesktopServices.openUrl(url)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls() and any(url.isLocalFile() for url in event.mimeData().urls()):
            event.acceptProposedAction()

    def dropEvent(self, event):
        for url in event.mimeData().urls():
            if url.isLocalFile():
                self.load_file(Path(url.toLocalFile()))
                event.acceptProposedAction()
                break


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(True)
    app.setApplicationName("Markdown Viewer")
    window = Viewer()
    if len(sys.argv) > 3 and sys.argv[1] == "--self-test":
        # A success report proves Qt loaded and rendered, unlike process liveness.
        window.settings = QSettings(str(Path(sys.argv[2]).with_suffix(".ini")), QSettings.Format.IniFormat)
        window.load_file(Path(sys.argv[3]))
        assert window.path == Path(sys.argv[3]).resolve()
        assert window.pages.currentIndex() == 0
        assert window.toc.topLevelItem(0).text(0) == "Welcome to Markdown Viewer"
        assert "Welcome to Markdown Viewer" in window.preview.toPlainText()
        window.toggle_source(True)
        assert window.source.toPlainText().startswith("# Welcome")
        window.toggle_source(False)
        window.show()
        app.processEvents()
        screenshot = Path(sys.argv[2]).with_suffix(".png")
        assert window.grab().save(str(screenshot))
        window.close()
        assert not window.isVisible()
        assert not window.refresh_timer.isActive()
        assert not window.watcher.files()
        Path(sys.argv[2]).write_text(json.dumps({"status": "passed", "checks": ["Qt imports", "document load", "rendered default", "source toggle", "table of contents", "window render", "close cleanup"]}, indent=2), encoding="utf-8")
        return
    window.show()
    if len(sys.argv) > 1:
        window.load_file(Path(sys.argv[1]))
    sys.exit(app.exec())


if __name__ == "__main__":
    try:
        main()
    except Exception:
        if len(sys.argv) > 2 and sys.argv[1] == "--self-test":
            record_test_failure()
            sys.exit(1)
        raise
