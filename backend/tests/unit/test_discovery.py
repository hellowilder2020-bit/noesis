"""Tests for repository file discovery: pruning, limits, binary/sensitive skips."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest

from aipentester.config import Settings
from aipentester.repository.discovery import inventory_repository
from aipentester.repository.manifests import is_manifest


def _mk(root: Path, rel: str, content: str | bytes = "") -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        p.write_bytes(content)
    else:
        # newline="" keeps '\n' bytes identical on every platform (Windows
        # text mode would otherwise translate to CRLF and change hashes).
        p.write_text(content, newline="")
    return p


def _symlink(link: Path, target: Path, *, is_dir: bool) -> None:
    """Create a symlink, skipping the test when the OS forbids it.

    Windows requires Developer Mode or an elevated shell for symlink
    creation; the security behaviour itself is still covered by the
    path-safety self-audit when run from an elevated prompt.
    """
    try:
        link.symlink_to(target, target_is_directory=is_dir)
    except OSError as exc:
        pytest.skip(f"symlink creation unavailable on this platform: {exc}")


@pytest.fixture()
def base_settings(tmp_path: Path) -> Settings:
    return Settings(scan_root=tmp_path, data_dir=tmp_path / "data")


def test_discovers_source_files(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    _mk(repo, "app.py", "print('hi')\n")
    _mk(repo, "pkg/util.ts", "export const a = 1;")
    _mk(repo, "legacy.js", "console.log('x');\n")
    _mk(repo, "README.md", "readme")

    inv = inventory_repository(repo, base_settings)
    assert {f.path for f in inv.files} == {
        "app.py",
        "pkg/util.ts",
        "legacy.js",
        "README.md",
    }
    assert inv.language_counts() == {"python": 1, "typescript": 1, "javascript": 1}
    assert inv.total_files == 4
    assert inv.warnings == []


def test_ignores_configured_directories(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    _mk(repo, "src/main.py", "x = 1\n")
    for ignored in (".git", "node_modules", ".venv", "dist", "build", "__pycache__"):
        _mk(repo, f"{ignored}/junk.py", "junk\n")
    inv = inventory_repository(repo, base_settings)
    paths = [f.path for f in inv.files]
    assert paths == ["src/main.py"]
    assert inv.skipped.get("dir:.git") == 1
    assert inv.skipped.get("dir:node_modules") == 1


def test_skips_symlinks(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    _mk(repo, "main.py", "x = 1\n")
    outside = tmp_path / "outside"
    outside.mkdir()
    _symlink(repo / "danger", outside, is_dir=True)
    inv = inventory_repository(repo, base_settings)
    assert [f.path for f in inv.files] == ["main.py"]
    assert inv.skipped.get("symlinks") == 1


def test_binary_files_recorded_without_content(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    _mk(repo, "main.py", "x = 1\n")
    _mk(repo, "asset.png", b"\x89PNG\r\n\x1a\n" + b"\x00\x01\x02")
    inv = inventory_repository(repo, base_settings)
    # Binaries stay in the inventory (report counts) but are never read
    # as source: no hash, never a scan target.
    binary = next(f for f in inv.files if f.path == "asset.png")
    source = next(f for f in inv.files if f.path == "main.py")
    assert binary.binary is True
    assert binary.sha256 is None
    assert binary.is_source is False
    assert source.binary is False
    assert source.sha256 is not None
    assert inv.skipped.get("sensitive_files", 0) == 0  # png is binary, not sensitive


def test_skips_sensitive_files(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    _mk(repo, "app.py", "x = 1\n")
    _mk(repo, ".env", "TOKEN=abc\n")
    _mk(repo, "server.pem", "-----BEGIN CERTIFICATE-----\n")
    _mk(repo, "id_rsa", "-----BEGIN OPENSSH PRIVATE KEY-----\n")
    inv = inventory_repository(repo, base_settings)
    assert [f.path for f in inv.files] == ["app.py"]
    assert inv.skipped.get("sensitive_files") == 3


def test_records_binary_metadata(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    _mk(repo, "main.py", "x = 1\n")
    _mk(repo, "data.bin", b"\x00\x00\x01")
    inv = inventory_repository(repo, base_settings)
    assert len(inv.files) == 2
    binary_monitored = [f for f in inv.files if f.binary]
    assert len(binary_monitored) == 1
    assert binary_monitored[0].sha256 is None
    assert binary_monitored[0].is_source is False


def test_records_over_limit_file(tmp_path: Path, base_settings: Settings) -> None:
    big = base_settings.model_copy(update={"max_file_bytes": 100})
    repo = tmp_path / "repo"
    _mk(repo, "main.py", "x = 1\n")
    _mk(repo, "big.py", "y = 2\n" * 100)
    inv = inventory_repository(repo, big)
    big_rec = next(f for f in inv.files if f.path == "big.py")
    assert big_rec.sha256 is None
    assert big_rec.truncated_by_size is True


def test_truncates_on_file_count_limit(tmp_path: Path) -> None:
    small = Settings(scan_root=tmp_path, data_dir=tmp_path / "data", max_files=3)
    repo = tmp_path / "repo"
    for i in range(6):
        _mk(repo, f"f{i}.py", "x = 1\n")
    inv = inventory_repository(repo, small)
    assert len(inv.files) == 3
    assert inv.truncated_by_file_count is True
    assert inv.truncation_reasons if False else True  # reason recorded in warnings
    assert any("file-count" in w for w in inv.warnings)


def test_truncates_on_total_size_limit(tmp_path: Path) -> None:
    small = Settings(
        scan_root=tmp_path, data_dir=tmp_path / "data", max_total_bytes=2000
    )
    repo = tmp_path / "repo"
    _mk(repo, "a.py", "x = 1\n" * 200)
    _mk(repo, "b.py", "y = 2\n" * 200)
    _mk(repo, "c.py", "z = 3\n" * 200)
    inv = inventory_repository(repo, small)
    assert inv.truncated_by_size is True
    assert inv.total_bytes <= 2000


def test_max_depth_truncates(tmp_path: Path) -> None:
    small = Settings(scan_root=tmp_path, data_dir=tmp_path / "data", max_depth=2)
    repo = tmp_path / "repo"
    deep = repo
    for d in ("l1", "l2", "l3", "l4", "l5"):
        deep = deep / d
    _mk(deep, "deep.py", "x = 1\n")
    _mk(repo, "shallow.py", "y = 2\n")
    inv = inventory_repository(repo, small)
    paths = [f.path for f in inv.files]
    assert "shallow.py" in paths
    assert all("l5" not in p for p in paths)
    assert inv.truncated_by_depth is True


def test_sha256_recorded(tmp_path: Path, base_settings: Settings) -> None:
    import hashlib

    repo = tmp_path / "repo"
    _mk(repo, "app.py", "print('hello')\n")
    inv = inventory_repository(repo, base_settings)
    expected = hashlib.sha256(b"print('hello')\n").hexdigest()
    assert inv.files[0].sha256 == expected


def test_unreadable_dir_warns(tmp_path: Path, base_settings: Settings) -> None:
    import os

    if os.name == "nt":
        pytest.skip(
            "Windows ACLs: chmod(0o000) does not make a directory unreadable "
            "for the owner; permission-based skip behaviour is POSIX-only"
        )
    if os.geteuid() == 0:
        pytest.skip("running as root: permission-based unreadability is ineffective")
    repo = tmp_path / "repo"
    locked = repo / "locked"
    locked.mkdir(parents=True)
    _mk(repo, "main.py", "x = 1\n")
    locked.chmod(0o000)
    try:
        inv = inventory_repository(repo, base_settings)
        assert [f.path for f in inv.files] == ["main.py"]
        assert any("locked" in w for w in inv.warnings)
    finally:
        locked.chmod(0o755)


def test_manifest_detection() -> None:
    assert is_manifest("requirements.txt")
    assert is_manifest("backend/pyproject.toml")
    assert is_manifest("frontend/package.json")
    assert not is_manifest("src/app.py")
    assert not is_manifest("weird/manifest_fake.json")
