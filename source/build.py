"""Run with the Python environment containing requirements.txt dependencies."""
import subprocess
import sys
import os
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
workspace = HERE.parent
build_root = HERE / "build" / uuid.uuid4().hex
staging = build_root / "dist"
environment = os.environ.copy()
if sys.platform == "win32":
    # DLLs from unrelated tools on PATH can shadow Windows' ICU DLL.
    # Keep discovery restricted to this Python environment and Windows.
    windows = Path(os.environ.get("SystemRoot", "C:/Windows"))
    environment["PATH"] = os.pathsep.join([
        str(Path(sys.executable).parent), str(windows / "System32"), str(windows),
    ])
subprocess.run([
    sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
    "--windowed", "--onedir", "--name", "MarkdownViewer",
    "--distpath", str(staging),
    "--workpath", str(build_root / "work"), "--specpath", str(HERE),
    str(HERE / "main.py"),
], check=True, env=environment)
result = staging / "MarkdownViewer"
destination = workspace / "output" / "MarkdownViewer"
backup = build_root / "previous-output"
for path in (result, destination, backup):
    if not path.resolve().is_relative_to(workspace.resolve()):
        raise RuntimeError("Build paths must stay inside the project")
if destination.exists():
    try:
        destination.rename(backup)
    except PermissionError as exc:
        raise SystemExit(f"Close Markdown Viewer before replacing its package. The new build is preserved at {result}") from exc
result.rename(destination)
print(f"Build published to {destination}")
