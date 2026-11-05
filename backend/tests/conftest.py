"""Pytest fixtures: fresh Settings + app per test run with temp scan root."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from aipentester.config import Settings, get_settings, reload_settings


@pytest.fixture()
def test_scan_root(tmp_path: "os.PathLike[str]") -> "os.PathLike[str]":
    root = tmp_path / "scan-root"
    root.mkdir()
    return root


@pytest.fixture()
def settings(test_scan_root, tmp_path) -> Settings:
    """Settings bound to a temporary scan root and data dir."""
    s = Settings(
        debug=True,
        scan_root=test_scan_root,  # type: ignore[arg-type]
        data_dir=tmp_path / "data",  # type: ignore[arg-type]
    )
    return s


@pytest.fixture()
def sample_client(tmp_path) -> Iterator[TestClient]:
    """TestClient pointed at the real samples/ scan root + isolated DB."""
    os.environ["PENTEST_SCAN_ROOT"] = str(testing_scan_root())
    os.environ["PENTEST_DATA_DIR"] = str(tmp_path / "data-samples")
    reload_settings()
    from aipentester.main import create_app

    with TestClient(create_app()) as c:
        yield c
    reload_settings()


def testing_scan_root():
    from aipentester.config import PROJECT_ROOT

    return PROJECT_ROOT / "samples"


def _fresh_client(test_scan_root, tmp_path) -> TestClient:
    """Create a TestClient with settings forced to the temp paths."""
    os.environ["PENTEST_SCAN_ROOT"] = str(test_scan_root)
    os.environ["PENTEST_DATA_DIR"] = str(tmp_path / "data")
    reload_settings()
    from aipentester.main import create_app

    app = create_app()
    return TestClient(app)


@pytest.fixture()
def client(test_scan_root, tmp_path) -> Iterator[TestClient]:
    c = _fresh_client(test_scan_root, tmp_path)
    with c:
        yield c
    reload_settings()
