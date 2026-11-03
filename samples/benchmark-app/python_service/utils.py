"""Helpers with unsafe deserialization/config-loading and safe alternatives."""

from __future__ import annotations

import ast
import json
import pickle
import yaml

STATE_DIR = "/var/app/state"


def load_user_state(session_id: str) -> dict:
    """VULNERABLE: loads a pickle from a request-influenced path."""
    path = f"{STATE_DIR}/{session_id}.pkl"
    with open(path, "rb") as fh:
        return pickle.loads(fh.read())


def load_user_state_safe(session_id: str) -> dict:
    """SAFE: JSON instead of pickle."""
    path = f"{STATE_DIR}/{session_id}.json"
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_config(path: str) -> dict:
    """VULNERABLE: yaml.load with the default Loader executes !!python/object
    constructors — arbitrary code execution from untrusted YAML."""
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.load(fh, Loader=yaml.Loader)


def load_config_safe(path: str) -> dict:
    """SAFE: yaml.safe_load."""
    with open(path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def compute_expression(expr: str):
    """VULNERABLE: eval on caller-provided input."""
    return eval(expr)  # noqa: S307


def compute_expression_safe(expr: str):
    """SAFE: literal_eval only accepts literals."""
    return ast.literal_eval(expr)
