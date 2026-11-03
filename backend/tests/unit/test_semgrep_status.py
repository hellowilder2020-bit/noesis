"""Tests for semgrep availability detection."""

from __future__ import annotations

import os
import stat
from pathlib import Path

from aipentester.config import Settings
from aipentester.scanners.semgrep import _run_version


def _fake_tool(tmpdir: Path, name: str, version_line: str) -> str:
    script = tmpdir / name
    script.write_text(f"#!/bin/sh\necho '{version_line}'\n")
    script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return str(script)


def _force_status_cache(*args):  # helper to bypass module cache when testing internals
    return _run_version(*args)


def test_finds_executable_and_reads_version(tmp_path: Path) -> None:
    tool = _fake_tool(tmp_path, "mysemgrep", "1.99.0")
    status = _force_status_cache(tool)
    assert status.installed is True
    assert status.version == "1.99.0"
    assert status.error is None


def test_missing_binary_reports_not_installed(tmp_path: Path) -> None:
    status = _force_status_cache(str(tmp_path / "definitely-not-here"))
    assert status.installed is False
    assert "not found" in (status.error or "")


def test_exit_nonzero_reports_error(tmp_path: Path) -> None:
    script = tmp_path / "badsxgrep"
    script.write_text("#!/bin/sh\nexit 3\n")
    script.chmod(0o755)
    status = _force_status_cache(str(script))
    assert status.installed is True
    assert status.version is None
    assert "exit 3" in (status.error or "")


def test_caches_within_window(tmp_path: Path, monkeypatch) -> None:
    import aipentester.scanners.semgrep as sg

    settings = Settings(data_dir=tmp_path / "d", semgrep_bin=_fake_tool(tmp_path, "s1", "2.0.0"))
    monkeypatch.setattr(sg, "_status_cache", None)
    first = sg.semgrep_status(settings)
    # delete the binary; cached result must survive within the refresh window
    (tmp_path / "s1").unlink()
    second = sg.semgrep_status(settings)
    assert first.version == second.version == "2.0.0"
    monkeypatch.setattr(sg, "_status_cache", None)
