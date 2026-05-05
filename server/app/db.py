from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, current_app, g


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  request_ip TEXT,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email_created
ON login_codes(email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_usage (
  user_id INTEGER NOT NULL,
  usage_date TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, usage_date),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        config = current_app.config["CHATDOWN_CONFIG"]
        database_path = Path(config.database_path)
        if database_path.parent != Path("."):
            database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        g.db = connection
    return g.db


def close_db(error: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db(app: Flask) -> None:
    with app.app_context():
        get_db().executescript(SCHEMA)
        ensure_login_code_columns()
        get_db().commit()


def query_one(sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
    return get_db().execute(sql, params).fetchone()


def ensure_login_code_columns() -> None:
    columns = {row["name"] for row in get_db().execute("PRAGMA table_info(login_codes)").fetchall()}
    migrations = {
        "request_ip": "ALTER TABLE login_codes ADD COLUMN request_ip TEXT",
        "failed_attempts": "ALTER TABLE login_codes ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
        "locked_at": "ALTER TABLE login_codes ADD COLUMN locked_at TEXT",
    }
    for column, statement in migrations.items():
        if column not in columns:
            get_db().execute(statement)
