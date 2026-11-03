"""Thin database helper. Safe as used; the UNSAFE usage lives at call sites."""

from __future__ import annotations

import sqlite3
from typing import Any

DB_PATH = "/var/app/data/service.db"


def query_db(sql: str, params: tuple | dict | None = None) -> list[dict[str, Any]]:
    """Execute *sql* with optional parameters. Parameterised statements are safe."""
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        cursor = connection.execute(sql, params or ())
        return [dict(row) for row in cursor.fetchall()]
    finally:
        connection.close()


def write_db(sql: str, params: tuple | dict | None = None) -> None:
    connection = sqlite3.connect(DB_PATH)
    try:
        connection.execute(sql, params or ())
        connection.commit()
    finally:
        connection.close()
