"""End-to-end tests for the "what went right / wrong" quality system.

These run real Semgrep against sandboxes and the benchmark fixture, so they
take a couple of minutes — this is the tool actually proving itself.
"""

from __future__ import annotations

import time

import pytest


@pytest.mark.integration
def test_quality_report_idle_then_full_run_passes(sample_client):
    # First, a fresh database should report "no run yet".
    idle = sample_client.get("/api/quality").json()
    assert idle["status"] in ("idle", "running")

    start = sample_client.post("/api/quality/run")
    assert start.status_code == 202
    # Double-start must be refused while running.
    duplicate = sample_client.post("/api/quality/run")
    assert duplicate.status_code == 409

    state: dict = {}
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        state = sample_client.get("/api/quality").json()
        if state["status"] in ("done", "error"):
            break
        time.sleep(1.0)

    assert state["status"] == "done", state.get("error")
    checks = state["checks"]
    assert len(checks) >= 15  # environment + safety + discovery + detection + benchmark

    failed = [c for c in checks if not c["passed"] and not c["skipped"]]
    assert failed == [], [(c["id"], c["actual"], c["detail"]) for c in failed]

    # Summary numbers must match the individual checks.
    assert state["summary"]["total"] == len(checks)
    assert state["summary"]["failed"] == 0

    # A second run must be accepted once the first one finished.
    assert sample_client.post("/api/quality/run").status_code == 202


@pytest.mark.integration
def test_quality_benchmark_ground_truth_covers_all_fixtures(sample_client):
    """Every planted vulnerability in the benchmark must be covered by a check."""
    from aipentester.services.quality_check import SAFE_RANGES, VULNERABLE_RANGES

    vulnerable_files = set(VULNERABLE_RANGES)
    safe_files = set(SAFE_RANGES)
    assert vulnerable_files == safe_files, "ground truth must cover the same files"
    assert len(VULNERABLE_RANGES) >= 5
    total_vulns = sum(len(v) for v in VULNERABLE_RANGES.values())
    total_safe = sum(len(v) for v in SAFE_RANGES.values())
    assert total_vulns >= 14 and total_safe >= 14
