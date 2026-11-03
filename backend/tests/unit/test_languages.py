"""Tests for repository/__init__.py empty and languages module."""

from aipentester.repository.languages import language_for


def test_detects_python() -> None:
    assert language_for("src/app.py") == "python"


def test_detects_javascript() -> None:
    assert language_for("a/b.js") == "javascript"
    assert language_for("x.mjs") == "javascript"


def test_detects_typescript() -> None:
    assert language_for("x.ts") == "typescript"
    assert language_for("y.tsx") == "typescript"
    assert language_for("z.jsx") == "javascript"


def test_unknown_language_returns_none() -> None:
    assert language_for("data.json") is None
    assert language_for("image.png") is None
    assert language_for("docs/readme.md") is None


def test_case_insensitive() -> None:
    assert language_for("MAIN.PY") == "python"
