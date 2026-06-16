"""SQLite read-projection (spec §7). A DISPOSABLE cache for fast UI + replay —
Band is the system of record. If this file is deleted, re-projecting from Band
rebuilds it exactly. (SQLite instead of Postgres: no Docker dependency on this
machine; same read-cache principle.)
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent.parent / "soundcheck.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    room_id      TEXT PRIMARY KEY,
    title        TEXT,
    created_at   TEXT,
    updated_at   TEXT,
    finding_count   INTEGER DEFAULT 0,
    control_count   INTEGER DEFAULT 0,
    orgcontext_count INTEGER DEFAULT 0,
    patch_count     INTEGER DEFAULT 0,
    approval_count  INTEGER DEFAULT 0,
    task_count      INTEGER DEFAULT 0,
    message_count   INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledger (
    id           TEXT PRIMARY KEY,
    room_id      TEXT,
    kind         TEXT,
    content      TEXT,
    thought      TEXT,
    tags         TEXT,   -- json array
    refs         TEXT,   -- json array of ledger ids
    status       TEXT,
    sender       TEXT,
    created_at   TEXT,
    via          TEXT
);
CREATE TABLE IF NOT EXISTS timeline (
    id           TEXT PRIMARY KEY,
    room_id      TEXT,
    mtype        TEXT,   -- text | thought | task | tool_call | tool_result | error
    sender       TEXT,
    sender_type  TEXT,
    content      TEXT,
    mentions     TEXT,   -- json array of resolved @names this message addresses
    created_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_room ON ledger(room_id);
CREATE INDEX IF NOT EXISTS idx_timeline_room ON timeline(room_id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# Columns added after the first schema shipped — ALTER them in if an older
# cache predates them (CREATE TABLE IF NOT EXISTS won't add to an existing table).
_RUNS_MIGRATIONS = {
    "task_count": "INTEGER DEFAULT 0",
    "message_count": "INTEGER DEFAULT 0",
}
_TIMELINE_MIGRATIONS = {
    "mentions": "TEXT",
}


def _ensure_columns(conn: sqlite3.Connection, table: str, cols: dict[str, str]) -> None:
    have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
    for col, decl in cols.items():
        if col not in have:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        _ensure_columns(conn, "runs", _RUNS_MIGRATIONS)
        _ensure_columns(conn, "timeline", _TIMELINE_MIGRATIONS)
        conn.commit()
    finally:
        conn.close()


def _j(v: Any) -> str:
    return json.dumps(v or [])


def upsert_run(conn: sqlite3.Connection, run: dict) -> None:
    conn.execute(
        """INSERT INTO runs (room_id,title,created_at,updated_at,finding_count,
              control_count,orgcontext_count,patch_count,approval_count,task_count,message_count)
           VALUES (:room_id,:title,:created_at,:updated_at,:finding_count,
              :control_count,:orgcontext_count,:patch_count,:approval_count,:task_count,:message_count)
           ON CONFLICT(room_id) DO UPDATE SET
              title=excluded.title, updated_at=excluded.updated_at,
              finding_count=excluded.finding_count, control_count=excluded.control_count,
              orgcontext_count=excluded.orgcontext_count, patch_count=excluded.patch_count,
              approval_count=excluded.approval_count, task_count=excluded.task_count,
              message_count=excluded.message_count""",
        run,
    )


def replace_ledger(conn: sqlite3.Connection, room_id: str, rows: list[dict]) -> None:
    conn.execute("DELETE FROM ledger WHERE room_id=?", (room_id,))
    conn.executemany(
        """INSERT OR REPLACE INTO ledger
           (id,room_id,kind,content,thought,tags,refs,status,sender,created_at,via)
           VALUES (:id,:room_id,:kind,:content,:thought,:tags,:refs,:status,:sender,:created_at,:via)""",
        rows,
    )


def replace_timeline(conn: sqlite3.Connection, room_id: str, rows: list[dict]) -> None:
    conn.execute("DELETE FROM timeline WHERE room_id=?", (room_id,))
    conn.executemany(
        """INSERT OR REPLACE INTO timeline
           (id,room_id,mtype,sender,sender_type,content,mentions,created_at)
           VALUES (:id,:room_id,:mtype,:sender,:sender_type,:content,:mentions,:created_at)""",
        rows,
    )
