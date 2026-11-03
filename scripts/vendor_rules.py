#!/usr/bin/env python
"""Vendor a curated subset of Semgrep community rules into the backend.

The scan path must work offline and deterministically, so rules are checked
into the repository instead of being fetched per scan.  Only directory paths
containing a 'security' segment are vendored (plus a small framework-specific
include list) — this keeps false-positive noise and rule count manageable.

Usage:
    .venv/bin/python scripts/vendor_rules.py   # requires a checkout at
                                               # /tmp/opencode/semgrep-rules
                                               # or pass --src <path>

After copying, every vendored rule file is validated with
``semgrep --validate``; invalid files are removed so a broken rule can never
fail an entire scan.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEST_ROOT = PROJECT_ROOT / "backend" / "aipentester" / "scanners" / "rules" / "registry"

SELLIST = frozenset({"security"})  # path segments that must appear
FRAMEWORK_EXTRAS = frozenset(
    {
        "python/flask",
        "python/requests",
        "python/sqlalchemy",
        "python/sh",
        "python/jwt",
        "python/jinja2",
        "python/cryptography",
        "python/pycryptodome",
        "javascript/express",
        "javascript/sequelize",
        "javascript/jsonwebtoken",
        "typescript/angular",
        "typescript/nestjs",
        "typescript/react",
    }
)


def _is_rule_file(path: Path) -> bool:
    return path.suffix in {".yaml", ".yml", ".json"}


def collect(src: Path) -> list[Path]:
    wanted: list[Path] = []
    allowed_tops = frozenset({"python", "javascript", "typescript"})
    for path in src.rglob("*"):
        if not path.is_file() or not _is_rule_file(path):
            continue
        rel = path.relative_to(src).as_posix()
        top = rel.split("/", 1)[0]
        if top not in allowed_tops:
            continue
        if rel.endswith(".json"):
            continue  # fixture files, not rules
        subpath = rel[len(top) + 1 :]
        segments = subpath.split("/")
        annotated = any(seg in SELLIST for seg in segments)
        if annotated or any(rel.startswith(prefix) for prefix in FRAMEWORK_EXTRAS):
            wanted.append(path)
    return wanted


def copy_rules(files: list[Path], src: Path) -> list[Path]:
    if DEST_ROOT.exists():
        shutil.rmtree(DEST_ROOT)
    copied: list[Path] = []
    for path in files:
        rel = path.relative_to(src).as_posix()
        dest = DEST_ROOT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        copied.append(dest)
    return copied


def _validate_dir(semgrep_bin: str, path: Path) -> tuple[bool, str]:
    proc = subprocess.run(
        [semgrep_bin, "--validate", "--config", str(path)],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    return proc.returncode == 0, (proc.stderr or "") + (proc.stdout or "")


def _files_with_rule_id(root: Path, rule_id: str) -> list[Path]:
    needle = f"id: {rule_id}\n"
    return sorted(p for p in root.rglob("*.y*ml") if needle in p.read_text(encoding="utf-8", errors="ignore"))


def prune_invalid(semgrep_bin: str) -> tuple[int, int]:
    """Validate the vendored tree as a *directory* (ground truth for scan time).

    Parse errors are iteratively resolved by locating the offending rule id in
    the error output and deleting the file that declares it — a rule that our
    semgrep version cannot load must never reach scan time.
    """
    files = sorted(DEST_ROOT.rglob("*.y*ml"))
    if not files:
        return 0, 0

    removed = 0
    for _attempt in range(50):
        ok, output = _validate_dir(semgrep_bin, DEST_ROOT)
        if ok:
            break
        rule_ids: set[str] = set()
        for line in output.splitlines():
            # e.g. "[ERROR] Pattern parse error in rule ssrf:"
            if " in rule " in line:
                rule_ids.add(line.split(" in rule ", 1)[1].rstrip(":").strip())
        if not rule_ids:
            # cannot attribute the failure — bail loudly rather than ship it
            raise RuntimeError(
                f"vendored rules failed validation without attributable rule ids:\n{output[-2000:]}"
            )
        removed_targets: list[Path] = []
        for rule_id in rule_ids:
            removed_targets.extend(_files_with_rule_id(DEST_ROOT, rule_id))
        if not removed_targets:
            raise RuntimeError(f"could not locate failing rules {rule_ids} in vendored tree")
        for path in set(removed_targets):
            path.unlink()
            removed += 1
            print(f"  removed (parse error): {path.relative_to(DEST_ROOT)}", file=sys.stderr)
        # clean empty dirs
        for directory in sorted((d for d in DEST_ROOT.rglob("*") if d.is_dir()), reverse=True):
            if not any(directory.iterdir()):
                directory.rmdir()
    else:
        raise RuntimeError("rule validation did not converge after 50 iterations")

    return len(files), removed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default="/tmp/opencode/semgrep-rules")
    parser.add_argument("--semgrep-bin", default="semgrep")
    args = parser.parse_args()

    src = Path(args.src)
    if not src.is_dir():
        print(f"source checkout not found: {src}", file=sys.stderr)
        return 1

    files = collect(src)
    print(f"collected {len(files)} rule files")
    copied = copy_rules(files, src)
    total, removed = prune_invalid(args.semgrep_bin)
    print(f"vendored {len(copied)} files -> {DEST_ROOT}")
    print(f"validation: kept {total - removed}, removed {removed} invalid")
    size = sum(p.stat().st_size for p in DEST_ROOT.rglob("*") if p.is_file())
    print(f"vendored size: {size / 1024:.0f} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
