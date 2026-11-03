"""Unit tests for Semgrep output normalisation, dedupe, redaction, vuln typing."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from aipentester.scanners.semgrep import (
    Candidate,
    infer_vuln_type,
    merge_overlaps,
    _parse_result_entry,
    _severity_from_semgrep,
)
from aipentester.security.redaction import redact_secrets


def test_severity_mapping() -> None:
    assert _severity_from_semgrep("ERROR") == "high"
    assert _severity_from_semgrep("WARNING") == "medium"
    assert _severity_from_semgrep("INFO") == "low"
    assert _severity_from_semgrep("GARBAGE") == "low"


def test_vuln_type_inference() -> None:
    assert infer_vuln_type("python.django.security.injection.tainted-sql-string") == "sql-injection"
    assert infer_vuln_type("javascript.lang.security.detect-child-process") == "command-injection"
    assert infer_vuln_type("python.lang.security.audit.eval-detected") == "code-execution"
    assert infer_vuln_type("python.lang.security.deserialization.avoid-pickle") == "unsafe-deserialization"
    assert infer_vuln_type("totally-unknown-rule") == "unknown"


def _mk_result(path: str, start: int, end: int, rule: str, sev: str = "ERROR") -> dict:
    # shape mimics real output: namespaced id with the `.registry.` marker
    return {
        "check_id": f"backend.aipentester.scanners.rules.registry.derp.{rule}",
        "path": path,
        "start": {"line": start, "col": 1},
        "end": {"line": end, "col": 5},
        "extra": {
            "message": f"msg for {rule}",
            "severity": sev,
            "lines": "line1\nline2\n" if end - start else "line1",
            "metadata": {"vulnerable_lines": None},
        },
    }


def test_parse_entry_normalises(tmp_path: Path) -> None:
    entry = _mk_result(str(tmp_path / "app.py"), 10, 10, "some.rule")
    entry["path"] = str(tmp_path / "app.py")  # absolute; must become relative
    cand = _parse_result_entry(tmp_path, entry)
    assert cand is not None
    assert cand.path == "app.py"
    assert cand.start_line == 10 and cand.end_line == 10
    assert cand.rules == ["some.rule"] or cand.rule_id.endswith("some.rule")
    assert cand.severity == "high"
    # excerpt present and redaction-safe by construction
    assert cand.excerpt_redacted is not None


def test_parse_entry_bad_line_numbers_returns_none(tmp_path: Path) -> None:
    entry = _mk_result("app.py", 0, 0, "some.rule")
    assert _parse_result_entry(tmp_path, entry) is None


def test_merge_overlaps_groups_and_bumps_severity(tmp_path: Path) -> None:
    a = _mk_result("app.py", 10, 10, "rule.a", "WARNING")
    b = _mk_result("app.py", 10, 12, "rule.b", "ERROR")
    c = _mk_result("app.py", 40, 40, "rule.c", "INFO")
    a = _parse_result_entry(tmp_path, a)
    b = _parse_result_entry(tmp_path, b)
    c = _parse_result_entry(tmp_path, c)
    merged = merge_overlaps([a, b, c])
    assert len(merged) == 2
    group = merged[0]
    assert group.start_line == 10 and group.end_line == 12
    assert group.severity == "high"
    assert set(group.rules) == {"derp.rule.a", "derp.rule.b"}
    # fingerprint matches rule|path|start|end
    expected = hashlib.sha1(f"{group.rule_id}|app.py|10|12".encode()).hexdigest()
    assert group.fingerprint == expected
    assert group.rule_id in {"derp.rule.a", "derp.rule.b"}


def test_merge_non_overlapping_stays_separate(tmp_path: Path) -> None:
    a = _mk_result("app.py", 10, 10, "rule.a")
    b = _mk_result("app.py", 20, 20, "rule.b")
    a = _parse_result_entry(tmp_path, a)
    b = _parse_result_entry(tmp_path, b)
    merged = merge_overlaps([a, b])
    assert len(merged) == 2


def test_redact_secrets_kv() -> None:
    src = 'API_TOKEN = "supersekrit12345"\ndb = connect(host="h")\n'
    out = redact_secrets(src)
    assert "supersekrit12345" not in out
    assert "[REDACTED]" in out
    assert 'db = connect(host="h")' in out


def test_redact_secrets_known_token_shapes() -> None:
    assert "[REDACTED]" in redact_secrets("Authorization: Bearer sk_demo-abcdef0123456789abcdef")
    assert redact_secrets("AKIAIOSFODNN7EXAMPLE") == "[REDACTED]"
    assert redact_secrets("ghp_" + "a" * 30) == "[REDACTED]"


def test_redact_pem_key_block() -> None:
    pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEA\n-----END OPENSSH PRIVATE KEY-----"
    assert "[REDACTED]" in redact_secrets(f"joined={pem!r}\n")
