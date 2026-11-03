"""Small Flask-style service used as a benchmark fixture.

Intentional vulnerabilities:
- /search     -> SQL built with string formatting using request data
- /run-job    -> os.popen with request-provided command
- /download   -> open() on a request-controlled path
- load_user_state / load_config in this package use pickle/yaml.load unsafely

Safe counterparts are included in the same file so rules and AI reasoning can
be validated against both.
"""

from __future__ import annotations

import os
from typing import Any

from flask import Flask, jsonify, request

from .db import query_db
from .utils import load_config, load_user_state

app = Flask(__name__)
app.config["SECRET_KEY"] = "hardcoded-dev-secret-not-for-production"

REPORTS_DIR = "/var/lib/reports"


@app.route("/search", methods=["GET"])
def search_users():
    """Unsafe: user-controlled `role` interpolates into SQL."""
    role = request.args.get("role", "")
    sql = "SELECT id, name, role FROM users WHERE role = '%s'" % role
    rows = query_db(sql)
    return jsonify(rows)


@app.route("/search-safe", methods=["GET"])
def search_users_safe():
    """Safe: parameterised query."""
    role = request.args.get("role", "")
    sql = "SELECT id, name, role FROM users WHERE role = ?"
    rows = query_db(sql, params=(role,))
    return jsonify(rows)


@app.route("/run-job", methods=["POST"])
def run_report_job():
    """Unsafe: request-provided command executed via the shell."""
    command = request.form.get("command", "")
    output = os.popen(command).read()
    return {"output": output}


@app.route("/run-job-safe", methods=["POST"])
def run_report_job_safe():
    """Safe: fixed argv list from an allowlist map, no shell involvement."""
    import subprocess

    tool = request.form.get("tool", "uptime")
    argv_map = {"uptime": ["/usr/bin/uptime"], "df": ["/bin/df"]}
    argv = argv_map.get(tool)
    if argv is None:
        return {"error": "unknown tool"}, 400
    result = subprocess.run(argv, capture_output=True, text=True, check=False)
    return {"output": result.stdout}


@app.route("/download", methods=["GET"])
def download_report():
    """Unsafe: request-controlled filename joined under a reports dir."""
    name = request.args.get("name", "")
    path = os.path.join(REPORTS_DIR, name)
    with open(path, "rb") as fh:
        return fh.read()


@app.route("/download-safe/<report_id>", methods=["GET"])
def download_report_safe(report_id: str):
    """Safe: allowlist lookup, no request path segment reaches open()."""
    allowed = {
        "daily": "daily.txt",
        "weekly": "weekly.txt",
        "monthly": "monthly.txt",
    }
    filename = allowed.get(report_id)
    if filename is None:
        return {"error": "unknown report"}, 404
    with open(os.path.join(REPORTS_DIR, filename), "rb") as fh:
        return {"filename": filename, "rows": _count_rows(fh)}


def _count_rows(fh: Any) -> int:
    return sum(1 for _ in fh)


@app.route("/session", methods=["GET"])
def session_state():
    """Unsafe: deserialises a pickle file from a request-controlled id."""
    session_id = request.args.get("id", "")
    state = load_user_state(session_id)
    return {"user": state.get("user")}
