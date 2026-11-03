"""Path-safety tests: traversal, symlinks, absolute paths, root checks."""

from __future__ import annotations

import pytest

from aipentester.security.paths import SafePathError, validate_inside_root


def _mkdir(parent, name: str):
    p = parent / name
    p.mkdir(parents=True, exist_ok=True)
    return p


def test_accepts_existing_subdirectory(tmp_path):
    child = _mkdir(tmp_path, "repo")
    assert validate_inside_root(tmp_path, "repo") == child.resolve()


def test_accepts_nested_missing_path(tmp_path):
    result = validate_inside_root(tmp_path, "repos/new-repo")
    assert result == (tmp_path / "repos" / "new-repo").resolve()


def test_rejects_parent_traversal(tmp_path):
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path, "../outside")


def test_rejects_disguised_traversal(tmp_path):
    _mkdir(tmp_path, "a")
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path, "a/../../outside")


def test_rejects_absolute_path_outside_root(tmp_path):
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path, "/etc/passwd")


def test_rejects_deep_traversal_primed_path(tmp_path):
    _mkdir(tmp_path, "a")
    _mkdir(tmp_path, "b")
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path, "a/../../b")


def test_rejects_missing_root(tmp_path):
    missing_root = tmp_path / "nope"
    with pytest.raises(SafePathError):
        validate_inside_root(missing_root, "x")


def test_rejects_root_nonexistent(tmp_path):
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path / "nope", "x")


def test_rejects_symlink_escape(tmp_path, tmp_path_factory):
    outside = tmp_path.parent / "outside_link_target"
    outside.mkdir(exist_ok=True)
    link = tmp_path / "link-out"
    link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path, "link-out")


def test_rejects_symlink_escape_under_subpath(tmp_path, tmp_path_factory):
    nested = _mkdir(tmp_path, "nested")
    outside = tmp_path.parent / "outside_target"
    outside.mkdir(exist_ok=True)
    (nested / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(SafePathError):
        validate_inside_root(tmp_path, "nested/link/../bait")


def test_accepts_absolute_path_inside_root(tmp_path):
    child = _mkdir(tmp_path, "repo")
    assert validate_inside_root(tmp_path, child) == child.resolve()


def test_rejects_root_itself_relatively(tmp_path):
    # '.' resolves to root — allowed (used by browse for the root listing)
    assert validate_inside_root(tmp_path, ".") == tmp_path.resolve()
