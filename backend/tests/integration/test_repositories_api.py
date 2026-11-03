"""Integration tests for the repositories API."""

from __future__ import annotations

import pytest


def _make_repo(root, rel: str) -> None:
    base = root / rel
    base.mkdir(parents=True, exist_ok=True)
    (base / "app.py").write_text("x = 1\n")
    pkg = base / "pkg"
    pkg.mkdir(exist_ok=True)
    (pkg / "util.py").write_text("y = 2\n")
    (base / "requirements.txt").write_text("flask>=3.0\n")
    # junk dirs to confirm pruning
    junk = base / "node_modules"
    junk.mkdir(exist_ok=True)
    (junk / "dep.js").write_text("var a=1;\n")


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "time" in body


def test_capabilities(client):
    resp = client.get("/api/system/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    assert "semgrep" in body
    assert "installed" in body["semgrep"]
    assert body["ai"]["provider"] == "openai_compatible"
    assert "ready" in body["ai"]
    assert body["ai"].get("api_key") is None
    assert "limits" in body


def test_inspect_requires_path(client):
    resp = client.post("/api/repositories/inspect", json={"path": ""})
    assert resp.status_code == 422


def test_inspect_returns_inventory(client, test_scan_root, tmp_path):
    _make_repo(test_scan_root, "demo-repo")
    resp = client.post("/api/repositories/inspect", json={"path": "demo-repo"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "demo-repo"
    assert body["total_files"] == 3
    assert body["source_files"] == 2
    assert body["languages"] == {"python": 2}
    assert body["manifests"] == ["requirements.txt"]
    assert body["root"].endswith("demo-repo")
    assert not body["truncated"]


def test_inspect_returns_404_for_missing(client, test_scan_root):
    resp = client.post("/api/repositories/inspect", json={"path": "no-such-repo"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_inspect_rejects_traversal(client, test_scan_root):
    resp = client.post("/api/repositories/inspect", json={"path": "../outside"})
    assert resp.status_code == 400
    assert "traversal" in resp.json()["detail"].lower()


def test_inspect_rejects_path_outside_root(client, test_scan_root, tmp_path):
    outside = tmp_path / "elsewhere"
    outside.mkdir()
    resp = client.post(
        "/api/repositories/inspect", json={"path": str(outside)}
    )
    assert resp.status_code == 400
    assert "outside the approved scan root" in resp.json()["detail"].lower()


def test_inspect_rejects_symlink_escape(client, test_scan_root):
    outside = test_scan_root.parent / "escape-target"
    outside.mkdir(exist_ok=True)
    link = test_scan_root / "escape-link"
    link.symlink_to(outside, target_is_directory=True)
    resp = client.post("/api/repositories/inspect", json={"path": "escape-link"})
    assert resp.status_code == 400
    assert "symbolic" in resp.json()["detail"].lower()


def test_browse_lists_directories(client, test_scan_root):
    (test_scan_root / "alpha").mkdir()
    (test_scan_root / "beta").mkdir()
    (test_scan_root / ".hidden").mkdir()
    (test_scan_root / "a.txt").write_text("hi")
    resp = client.get("/api/repositories/browse", params={"path": ""})
    assert resp.status_code == 200
    body = resp.json()
    assert body["path"] == ""
    assert body["directories"] == ["alpha", "beta"]
    assert body["files"] == ["a.txt"]


def test_browse_nested_path(client, test_scan_root):
    (test_scan_root / "alpha" / "sub").mkdir(parents=True)
    (test_scan_root / "alpha" / "main.py").write_text("x=1\n")
    resp = client.get("/api/repositories/browse", params={"path": "alpha"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["path"] == "alpha"
    assert body["directories"] == ["sub"]
    assert body["files"] == ["main.py"]


def test_browse_missing_dir_404(client, test_scan_root):
    resp = client.get("/api/repositories/browse", params={"path": "ghost"})
    assert resp.status_code == 404


def test_inspect_limited_file_preview(client, test_scan_root):
    base = test_scan_root / "big-repo"
    base.mkdir()
    for i in range(300):
        (base / f"f{i}.py").write_text(f"x{i} = {i}\n")
    resp = client.post("/api/repositories/inspect", json={"path": "big-repo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_files"] == 300
    assert len(body["files"]) <= 250
    assert not body["truncated"]
