import sqlite3
import threading
from shared.storage_paths import DB_PATH

_local = threading.local()
_lock = threading.Lock()


def get_db() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def execute(sql: str, params=()):
    with _lock:
        db = get_db()
        cur = db.execute(sql, params)
        db.commit()
        return cur


def executemany(sql: str, rows: list):
    with _lock:
        db = get_db()
        cur = db.executemany(sql, rows)
        db.commit()
        return cur


def executescript(sql: str):
    with _lock:
        db = get_db()
        db.executescript(sql)
        db.commit()


def fetchone(sql: str, params=()) -> sqlite3.Row | None:
    with _lock:
        db = get_db()
        return db.execute(sql, params).fetchone()


def fetchall(sql: str, params=()) -> list:
    with _lock:
        db = get_db()
        return db.execute(sql, params).fetchall()
