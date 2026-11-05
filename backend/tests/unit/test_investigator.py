"""Unit tests for the AI investigator: parsing, context engine, verification."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aipentester.config import Settings
from aipentester.services.context import (
    ContextUnavailableError,
    build_candidate_context,
)
from aipentester.services.investigator import parse_ai_verdict, verify_evidence


@pytest.fixture()
def base_settings(tmp_path: Path) -> Settings:
    return Settings(scan_root=tmp_path, data_dir=tmp_path / "data")


# -- verdict parsing ---------------------------------------------------------

def test_parse_verdict_plain_json() -> None:
    verdict = parse_ai_verdict(json.dumps({
        "assessment": "confirmed_by_available_evidence",
        "vulnerability_type": "sql-injection",
        "severity": "high",
        "confidence": 0.9,
        "explanation": "f-string SQL",
        "remediation": "use parameters",
        "uncertainty": "",
        "evidence": [{"path": "a.py", "start_line": 3, "end_line": 3, "excerpt": "x = 1"}],
    }))
    assert verdict["assessment"] == "confirmed_by_available_evidence"
    assert verdict["confidence"] == 0.9
    assert verdict["evidence"][0]["path"] == "a.py"


def test_parse_verdict_strips_markdown_fence() -> None:
    raw = "Here is my verdict:\n```json\n{\"assessment\": \"potential\", \"confidence\": 0.5}\n```"
    verdict = parse_ai_verdict(raw)
    assert verdict["assessment"] == "potential"


def test_parse_verdict_clamps_bad_values() -> None:
    verdict = parse_ai_verdict(
        '{"assessment": "totally-made-up", "confidence": 7, "evidence": "not-a-list"}'
    )
    assert verdict["assessment"] == "inconclusive"
    assert verdict["confidence"] == 1.0  # clamped into range
    assert verdict["evidence"] == []


def test_parse_verdict_no_json_raises() -> None:
    with pytest.raises(ValueError):
        parse_ai_verdict("I cannot answer that.")


# -- context engine ----------------------------------------------------------

def test_context_returns_numbered_window(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("\n".join(f"line {i}" for i in range(1, 41)) + "\n")
    ctx = build_candidate_context(repo, "app.py", 20, 20, base_settings)
    nums = [int(l["n"]) for l in ctx["lines"]]
    assert nums[0] < 20 < nums[-1]
    assert any(l["text"] == "line 20" for l in ctx["lines"])
    assert ctx["total_lines"] == 40


def test_context_refuses_sensitive_files(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".env").write_text("SECRET=x\n")
    with pytest.raises(ContextUnavailableError):
        build_candidate_context(repo, ".env", 1, 1, base_settings)


def test_context_refuses_paths_outside_repo(tmp_path: Path, base_settings: Settings) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    with pytest.raises(ContextUnavailableError):
        build_candidate_context(repo, "../../outside/secret.py", 1, 1, base_settings)


def test_context_caps_window(tmp_path: Path) -> None:
    small = Settings(scan_root=tmp_path, data_dir=tmp_path / "d",
                     context_max_lines=6, context_max_chars=10_000)
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("\n".join(f"line {i}" for i in range(1, 101)) + "\n")
    ctx = build_candidate_context(repo, "app.py", 50, 50, small)
    assert len(ctx["lines"]) <= 6
    assert any(int(l["n"]) == 50 for l in ctx["lines"])  # match stays centred


# -- evidence verification ---------------------------------------------------

def test_verify_evidence_all_verified(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("line one\nline two\nline three\n")
    status, checks = verify_evidence(
        repo,
        [{"path": "app.py", "start_line": 2, "end_line": 2, "excerpt": "line two"}],
    )
    assert status == "verified"
    assert checks[0]["status"] == "verified"


def test_verify_evidence_partial_and_unsupported(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("line one\nline two\n")
    status, checks = verify_evidence(
        repo,
        [
            {"path": "app.py", "start_line": 1, "end_line": 1, "excerpt": "line one"},
            {"path": "app.py", "start_line": 9, "end_line": 9, "excerpt": "fabricated code"},
        ],
    )
    assert status == "partially_verified"

    status2, _ = verify_evidence(
        repo,
        [{"path": "app.py", "start_line": 9, "end_line": 9, "excerpt": "made up"}],
    )
    assert status2 == "unsupported"


def test_verify_evidence_handles_whitespace_differences(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "app.py").write_text("def  f( x ):\n    return  x\n")
    status, _ = verify_evidence(
        repo,
        [{"path": "app.py", "start_line": 1, "end_line": 2, "excerpt": "def f( x ): return x"}],
    )
    assert status == "verified"


def test_verify_evidence_missing_file(tmp_path: Path) -> None:
    status, checks = verify_evidence(
        tmp_path,
        [{"path": "ghost.py", "start_line": 1, "end_line": 1, "excerpt": "x"}],
    )
    assert status == "unsupported"
    assert checks[0]["status"] == "unreadable"
