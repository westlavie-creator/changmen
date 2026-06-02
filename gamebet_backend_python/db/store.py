import json
import time
from db.client import execute, executemany, fetchone, fetchall
from db.schema import init_schema

init_schema()


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> int:
    return int(time.time() * 1000)


def _row_to_user(row) -> dict | None:
    if not row:
        return None
    try:
        setting = json.loads(row["setting"] or "{}")
    except Exception:
        setting = {}
    return {
        "id": row["id"],
        "userName": row["user_name"],
        "passwordHash": row["password_hash"],
        "salt": row["salt"],
        "setting": setting,
    }


# ── users ─────────────────────────────────────────────────────────────────────

def save_users(users: list):
    if not users:
        return
    now = _now()
    rows = []
    for u in users:
        if not (u.get("id") and u.get("userName") and u.get("passwordHash") and u.get("salt")):
            continue
        rows.append((
            int(u["id"]), str(u["userName"]), str(u["passwordHash"]), str(u["salt"]),
            json.dumps(u.get("setting") or {}),
            int(u.get("createdAt") or now), int(u.get("updatedAt") or now),
        ))
    if rows:
        executemany("""
            INSERT INTO users (id, user_name, password_hash, salt, setting, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                user_name=excluded.user_name, password_hash=excluded.password_hash,
                salt=excluded.salt, setting=excluded.setting, updated_at=excluded.updated_at
        """, rows)


def list_users() -> list:
    return [_row_to_user(r) for r in fetchall("SELECT * FROM users ORDER BY id")]


def get_user_by_name(user_name: str) -> dict | None:
    return _row_to_user(fetchone("SELECT * FROM users WHERE user_name=?", (str(user_name or ""),)))


def get_user_by_id(user_id: int) -> dict | None:
    return _row_to_user(fetchone("SELECT * FROM users WHERE id=?", (int(user_id),)))


def create_user(user: dict) -> dict | None:
    now = _now()
    if user.get("id"):
        uid = int(user["id"])
    else:
        row = fetchone("SELECT COALESCE(MAX(id),0)+1 AS id FROM users")
        uid = row["id"]
    execute("""
        INSERT INTO users (id, user_name, password_hash, salt, setting, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
            user_name=excluded.user_name, password_hash=excluded.password_hash,
            salt=excluded.salt, setting=excluded.setting, updated_at=excluded.updated_at
    """, (uid, str(user.get("userName","")), str(user.get("passwordHash","")),
          str(user.get("salt","")), json.dumps(user.get("setting") or {}), now, now))
    return get_user_by_id(uid)


def update_user_setting(user_id: int, patch: dict) -> dict | None:
    user = get_user_by_id(user_id)
    if not user:
        return None
    setting = {**(user.get("setting") or {}), **(patch or {})}
    execute("UPDATE users SET setting=?, updated_at=? WHERE id=?",
            (json.dumps(setting), _now(), int(user_id)))
    return get_user_by_id(user_id)


# ── accounts ──────────────────────────────────────────────────────────────────

def _account_to_row(user_id: int, account: dict, sort_order: int = 0) -> tuple:
    now = _now()
    return (
        int(user_id),
        None if account.get("accountId") is None else int(account["accountId"]),
        None if account.get("platformId") is None else int(account["platformId"]),
        account.get("platformName"), account.get("playerName"),
        account.get("provider"), account.get("gateway"), account.get("token"),
        account.get("referer"), account.get("userAgent"), account.get("cookie"),
        account.get("currency"),
        None if account.get("balance") is None else float(account["balance"]),
        None if account.get("credit") is None else float(account["credit"]),
        1 if account.get("active") else 0,
        1 if account.get("pause") else 0,
        sort_order, json.dumps(account),
        int(account.get("createdAt") or now),
        int(account.get("updatedAt") or account.get("updateTime") or now),
    )


def _row_to_account(row) -> dict:
    if not row:
        return {}
    try:
        return json.loads(row["raw"])
    except Exception:
        return {"accountId": row["account_id"], "platformName": row["platform_name"] or ""}


def replace_accounts_for_user(user_id: int, accounts: list) -> list:
    from db.client import get_db, _lock
    with _lock:
        db = get_db()
        db.execute("DELETE FROM accounts WHERE user_id=?", (int(user_id),))
        rows = [_account_to_row(user_id, a, i) for i, a in enumerate(accounts or [])]
        if rows:
            db.executemany("""
                INSERT INTO accounts
                (user_id,account_id,platform_id,platform_name,player_name,provider,
                 gateway,token,referer,user_agent,cookie,currency,balance,credit,
                 active,pause,sort_order,raw,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, rows)
        db.commit()
    return list_accounts_for_user(user_id)


def list_accounts_for_user(user_id: int) -> list:
    rows = fetchall("SELECT * FROM accounts WHERE user_id=? ORDER BY sort_order,id", (int(user_id),))
    return [_row_to_account(r) for r in rows]


def count_accounts() -> int:
    row = fetchone("SELECT COUNT(*) AS count FROM accounts")
    return row["count"] if row else 0


def update_account_for_user(user_id: int, account_id, updates: dict):
    accounts = list_accounts_for_user(user_id)
    idx = next((i for i, a in enumerate(accounts) if str(a.get("accountId")) == str(account_id)), -1)
    if idx < 0:
        return None
    accounts[idx] = {**accounts[idx], **updates, "updateTime": _now()}
    replace_accounts_for_user(user_id, accounts)
    return accounts[idx]


def remove_account_for_user(user_id: int, account_id) -> bool:
    cur = execute("DELETE FROM accounts WHERE user_id=? AND account_id=?",
                  (int(user_id), int(account_id)))
    return cur.rowcount > 0


# ── user_settings ─────────────────────────────────────────────────────────────

def set_user_setting(user_id: int, key: str, content: str):
    now = _now()
    execute("""
        INSERT INTO user_settings (user_id, key, content, created_at, updated_at)
        VALUES (?,?,?,?,?)
        ON CONFLICT(user_id, key) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at
    """, (int(user_id), str(key), str(content or ""), now, now))


def get_user_setting(user_id: int, key: str) -> str | None:
    row = fetchone("SELECT content FROM user_settings WHERE user_id=? AND key=?",
                   (int(user_id), str(key)))
    return row["content"] if row else None


def count_user_settings() -> int:
    row = fetchone("SELECT COUNT(*) AS count FROM user_settings")
    return row["count"] if row else 0


# ── ob_matches ────────────────────────────────────────────────────────────────

def save_ob_matches(matches: list):
    if not matches:
        return
    now = _now()
    rows = [(
        str(m["SourceMatchID"]), str(m.get("SourceGameID") or ""),
        str(m.get("Home") or ""), str(m.get("HomeID") or ""),
        str(m.get("Away") or ""), str(m.get("AwayID") or ""),
        int(m.get("BO") or 0), int(m.get("StartTime") or 0),
        1, now, json.dumps({**m, "provider": "OB", "savedAt": now}),
    ) for m in matches]
    executemany("""
        INSERT OR REPLACE INTO ob_matches
        (source_match_id,source_game_id,home,home_id,away,away_id,bo,start_time,is_live,saved_at,raw)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    """, rows)


def prune_ob_matches(active_ids: list):
    if not active_ids:
        execute("DELETE FROM ob_matches")
        return
    placeholders = ",".join("?" * len(active_ids))
    execute(f"DELETE FROM ob_matches WHERE source_match_id NOT IN ({placeholders})", active_ids)


# ── client_matches ────────────────────────────────────────────────────────────

def save_client_matches(info: list):
    if not info:
        return
    now = _now()
    rows = [(
        int(m["ID"]), str(m.get("Title") or ""), str(m.get("Game") or ""),
        str(m.get("GameID") or ""), int(m.get("StartTime") or 0),
        int(m.get("BO") or 0), int(m.get("Round") or 0),
        json.dumps(m.get("Matchs") or {}), json.dumps(m.get("Bets") or []), now,
    ) for m in info]
    executemany("""
        INSERT OR REPLACE INTO client_matches
        (id,title,game,game_id,start_time,bo,round,matchs,bets,built_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, rows)


def prune_client_matches(active_ids: list):
    if not active_ids:
        execute("DELETE FROM client_matches")
        return
    placeholders = ",".join("?" * len(active_ids))
    execute(f"DELETE FROM client_matches WHERE id NOT IN ({placeholders})", active_ids)


def get_client_matches() -> list | None:
    rows = fetchall("SELECT * FROM client_matches ORDER BY start_time")
    if not rows:
        return None
    return [{
        "ID": r["id"], "Title": r["title"], "Game": r["game"], "GameID": r["game_id"],
        "StartTime": r["start_time"], "BO": r["bo"], "Round": r["round"],
        "Matchs": json.loads(r["matchs"]), "Bets": json.loads(r["bets"]),
    } for r in rows]
