"""Verify a frozen build using an explicit report, not process liveness."""
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

root = Path(__file__).resolve().parent.parent.parent
if sys.platform != "win32":
    raise SystemExit("This verifier targets the Windows executable")
report = root / "output" / f"startup-check-{uuid.uuid4().hex}.json"
environment = os.environ.copy()
windows = Path(os.environ.get("SystemRoot", "C:/Windows"))
environment["PATH"] = os.pathsep.join([str(windows / "System32"), str(windows)])
for key in ("PYTHONPATH", "PYTHONHOME", "QT_PLUGIN_PATH", "QT_QPA_PLATFORM_PLUGIN_PATH"):
    environment.pop(key, None)
subprocess.run([
    str(root / "output" / "MarkdownViewer" / "MarkdownViewer.exe"),
    "--self-test", str(report), str(root / "source" / "python" / "sample.md"),
], cwd=windows, env=environment, timeout=60, check=True)
assert report.exists(), "Executable did not produce a success report"
result = json.loads(report.read_text(encoding="utf-8"))
assert result["status"] == "passed", result
print(json.dumps(result, indent=2))
print(f"Preview: {report.with_suffix('.png')}")
