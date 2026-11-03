"""End-to-end integration tests for the scan pipeline (real Semgrep run)."""

from __future__ import annotations

import time


def _wait_terminal(client, scan_id: str, timeout_s: float = 120.0) -> dict:
    deadline = time.monotonic() + timeout_s
    last = {}
    while time.monotonic() < deadline:
        r = client.get(f"/api/scans/{scan_id}")
        assert r.status_code == 200, r.text
        last = r.json()
        if last["status"] in {"completed", "completed_with_warnings", "failed", "interrupted"}:
            return last
        time.sleep(0.3)
    raise AssertionError(f"scan did not finish in {timeout_s}s: {last}")


def test_scan_completes_and_finds_candidates(sample_client):
    start = sample_client.post(
        "/api/scans",
        json={"path": "benchmark-app", "investigate": False},
    )
    assert start.status_code == 202, start.text
    scan_id = start.json()["id"]

    detail = _wait_terminal(sample_client, scan_id)
    assert detail["status"] in {"completed", "completed_with_warnings"}, detail
    assert detail["scanner_status"]["semgrep"]["status"] == "ok"
    assert detail["candidates_count"] > 0

    cands = sample_client.get(f"/api/scans/{scan_id}/candidates").json()
    assert len(cands) == detail["candidates_count"]

    app_cands = [c for c in cands if c["path"] == "python_service/app.py"]
    assert app_cands, "expected candidates in app.py"


def test_scan_finds_expected_vulnerabilities(sample_client):
    start = sample_client.post("/api/scans", json={"path": "benchmark-app"})
    scan_id = start.json()["id"]
    detail = _wait_terminal(sample_client, scan_id)
    assert detail["status"] in {"completed", "completed_with_warnings"}

    cands = sample_client.get(f"/api/scans/{scan_id}/candidates").json()
    paths = {c["path"] for c in cands}
    assert "python_service/app.py" in paths
    assert "ts_service/server.ts" in paths
    assert "legacy_js/backup.js" in paths
    tallies = {(c["path"], c["start_line"]) for c in cands}

    # vulnerable SQL string construction (search endpoint)
    assert any(
        p == "python_service/app.py" and 33 <= line <= 35 for (p, line) in tallies
    )
    # path traversal open()
    assert any(
        p == "python_service/app.py" and 70 <= line <= 76 for (p, line) in tallies
    )
    # unsafe pickle
    assert any(p == "python_service/utils.py" and line <= 20 for (p, line) in tallies)
    # unsafe yaml.load
    assert any(p == "python_service/utils.py" and 28 <= line <= 35 for (p, line) in tallies)
    # eval
    assert any(p == "python_service/utils.py" and 40 <= line <= 45 for (p, line) in tallies)
    # requests with verify=False
    assert any(p == "python_service/flows.py" and 28 <= line <= 32 for (p, line) in tallies)
    # os.system with f-string command construction
    assert any(p == "python_service/flows.py" and 46 <= line <= 50 for (p, line) in tallies)
    # subprocess.run(..., shell=True)
    assert any(p == "python_service/flows.py" and 59 <= line <= 63 for (p, line) in tallies)
    # weak md5 hashing of credentials
    assert any(p == "ts_service/jobs.ts" and 14 <= line <= 16 for (p, line) in tallies)
    # JS tainted SQL through db.query
    assert any(p == "ts_service/server.ts" and 20 <= line <= 26 for (p, line) in tallies)
    # open redirect via res.redirect(tainted)
    assert any(p == "ts_service/server.ts" and 62 <= line <= 66 for (p, line) in tallies)
    # fs.readFileSync on a request-controlled path
    assert any(p == "ts_service/server.ts" and 75 <= line <= 79 for (p, line) in tallies)
    # legacy exec with interpolated shell string
    assert any(p == "legacy_js/backup.js" and line <= 12 for (p, line) in tallies)


def test_scan_does_not_flag_safe_counterparts(sample_client):
    start = sample_client.post("/api/scans", json={"path": "benchmark-app"})
    scan_id = start.json()["id"]
    detail = _wait_terminal(sample_client, scan_id)
    cands = sample_client.get(f"/api/scans/{scan_id}/candidates").json()

    # The stale flagged-safe-line (subprocess.run with allowlist argv) must not be
    # reported: we exclude the noisy heuristic rule.
    from aipentester.scanners.semgrep import EXCLUDED_RULE_IDS  # local import to avoid cycle

    for c in cands:
        assert c["rule_id"] not in EXCLUDED_RULE_IDS

    tallies = {(c["path"], c["start_line"]): c for c in cands}
    app = [(c["start_line"], c["end_line"]) for c in cands if c["path"] == "python_service/app.py"]

    # safe search endpoint (parameterised query) around lines 39-45
    for lo, _hi in app:
        assert not (39 <= lo <= 45), f"candidate flagged on /search-safe body: {tallies}"

    flows = [(c["start_line"]) for c in cands if c["path"] == "python_service/flows.py"]
    vulnerable_flows = {30, 48, 61}
    for lo in flows:
        assert lo in vulnerable_flows, f"candidate outside known vulnerable lines: {tallies}"

    server = [(c["start_line"]) for c in cands if c["path"] == "ts_service/server.ts"]
    for lo in server:
        assert not (67 <= lo <= 73), f"candidate flagged on /go-safe: {tallies}"
        assert not (80 <= lo <= 88), f"candidate flagged on /report-safe: {tallies}"
        assert not (29 <= lo <= 35), f"candidate flagged on /search-safe: {tallies}"
        assert not (46 <= lo <= 56), f"candidate flagged on /run-safe: {tallies}"

    jobs = [(c["start_line"]) for c in cands if c["path"] == "ts_service/jobs.ts"]
    for lo in jobs:
        assert not (19 <= lo <= 28), f"candidate flagged on safe hash: {tallies}"
        assert not (36 <= lo <= 48), f"candidate flagged on safe redirect: {tallies}"
        assert not (54 <= lo <= 66), f"candidate flagged on safe read: {tallies}"


def test_scan_unavailable_scanner_still_completes(client, test_scan_root, tmp_path):
    # create a tiny repo without touching semgrep
    repo = test_scan_root / "small-app"
    repo.mkdir()
    (repo / "app.py").write_text("print('x')\n")
    start = client.post("/api/scans", json={"path": "small-app"})
    assert start.status_code == 202
    detail = _wait_terminal(client, start.json()["id"])
    assert detail["status"] in {"completed", "completed_with_warnings"}
    assert detail["scanner_status"]["semgrep"]["status"] in {"ok", "unavailable"}
