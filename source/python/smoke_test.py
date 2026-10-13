"""Headless integration checks: python smoke_test.py."""
import os
os.environ["QT_QPA_PLATFORM"] = "offscreen"
import tempfile
import time
from pathlib import Path
from PySide6.QtCore import QUrl, QTimer, Qt
from PySide6.QtWidgets import QApplication
from main import Viewer, render, render_document


app = QApplication([])
assert "<script>" not in render("<script>alert(1)</script>")
assert "<table>" in render("| A | B |\n|---|---|\n| 1 | 2 |")
html, headings = render_document("# Same\n### **Child**\n# Same\n```\n# Not a heading\n```\nSetext\n======")
assert [h[1] for h in headings] == ["Same", "Child", "Same", "Setext"]
assert len({h[2] for h in headings}) == 4
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / "example.md"
    path.write_text("# First\n\n**Bold**", encoding="utf-8")
    window = Viewer()
    window.load_file(path)
    assert window.pages.currentIndex() == 0
    assert window.toc.topLevelItem(0).text(0) == "First"
    assert "First" in window.preview.toPlainText()
    window.toggle_source(True)
    assert window.source.toPlainText().startswith("# First")
    window.zoom(1)
    window.toggle_theme(True)
    path.write_text("# Updated", encoding="utf-8")
    deadline = time.monotonic() + 3
    while "Updated" not in window.preview.toPlainText() and time.monotonic() < deadline:
        app.processEvents()
        time.sleep(0.03)
    assert "Updated" in window.preview.toPlainText(), "External file refresh failed"
    assert window.toc.topLevelItem(0).text(0) == "Updated"
    assert window.pages.currentIndex() == 1, "Refresh should preserve source view"
    second = Path(folder) / "second.md"
    second.write_text("# Second", encoding="utf-8")
    window.open_link(QUrl("second.md"))
    assert window.path == second.resolve()
    assert window.pages.currentIndex() == 0
    window.close()
    assert not window.watcher.files() and not window.refresh_timer.isActive()
    window = Viewer()
    window.text = "# Top\n\n" + "Paragraph\n\n" * 100 + "## Bottom"
    window.update_preview()
    window.show()
    app.processEvents()
    bottom = window.toc.topLevelItem(0).child(0)
    assert bottom.text(0) == "Bottom"
    window.toggle_source(True)
    window.navigate_heading(bottom)
    assert window.pages.currentIndex() == 0
    assert window.preview.verticalScrollBar().value() > 0, "TOC anchor did not scroll"
    window.refresh_timer.start()
    QTimer.singleShot(50, window.close)
    # Native title-bar X invokes the same close event; prove the event loop exits.
    assert app.exec() == 0
    assert not window.isVisible() and not window.refresh_timer.isActive()
print("PASS: rendering, safe HTML, tables, source toggle, theme, zoom, file watcher, relative links, TOC hierarchy/navigation/refresh, close event-loop exit")
