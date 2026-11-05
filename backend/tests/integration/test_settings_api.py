"""Integration tests for runtime settings (scan-root selection)."""

from __future__ import annotations


def test_get_settings_returns_roots(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert body["scan_root"]
    assert body["data_dir"]
    assert "provider" in body["ai"]
    assert "ready" in body["ai"]


def test_update_scan_root_requires_absolute_path(client):
    resp = client.post("/api/settings/scan-root", json={"path": "relative/path"})
    assert resp.status_code == 400
    assert "absolute" in resp.json()["detail"].lower()


def test_update_scan_root_missing_path(client, tmp_path):
    resp = client.post("/api/settings/scan-root", json={"path": str(tmp_path / "nope")})
    assert resp.status_code == 404


def test_update_scan_root_file_not_directory(client, tmp_path):
    target = tmp_path / "afile.txt"
    target.write_text("x")
    resp = client.post("/api/settings/scan-root", json={"path": str(target)})
    assert resp.status_code == 400
    assert "not a directory" in resp.json()["detail"].lower()


def test_update_scan_root_then_browse_and_scan(client, tmp_path):
    """Changing the root must move the whole browsing/scanning boundary."""
    new_root = tmp_path / "my-projects"
    repo = new_root / "cool-app"
    repo.mkdir(parents=True)
    (repo / "app.py").write_text("x = 1\n")

    resp = client.post("/api/settings/scan-root", json={"path": str(new_root)})
    assert resp.status_code == 200, resp.text
    assert resp.json()["scan_root"].lower() == str(new_root.resolve()).lower()

    # browse now lists the new root's contents
    browse = client.get("/api/repositories/browse", params={"path": ""})
    assert browse.status_code == 200
    assert "cool-app" in browse.json()["directories"]

    # paths inside the new root inspect fine
    inspect = client.post("/api/repositories/inspect", json={"path": "cool-app"})
    assert inspect.status_code == 200
    assert inspect.json()["total_files"] == 1

    # and a scan can start there
    start = client.post("/api/scans", json={"path": "cool-app"})
    assert start.status_code == 202

    # old root is no longer reachable
    old_outside = client.post("/api/repositories/inspect", json={"path": "../../samples"})
    assert old_outside.status_code == 400
