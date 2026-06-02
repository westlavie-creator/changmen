import json
import os
import threading
import hashlib
import secrets
import time
from pathlib import Path

from shared.storage_paths import ESPORT_DATA_DIR
from shared.match_time import a8_start_time_list_allowed, normalize_epoch_ms
from shared.im_parse import normalize_im_bet
from shared.odds_format import format_bet_odds
import db.store as db_store

DATA_DIR = ESPORT_DATA_DIR
CLIENT_MATCHS_DEBOUNCE_MS = int(os.environ.get("ESPORT_CLIENT_MATCHS_DEBOUNCE_MS", "400")) / 1000

_lock = threading.Lock()
_rebuild_timer: threading.Timer | None = None

DEFAULT_USER_KV = {
    "CollectConfig": json.dumps({"log": False, "collect": []}),
    "USERCONFIG": json.dumps({"betting": False, "betMoney": 100, "profit": 1.03,
                               "maxProfit": 1.2, "minOdds": 1.3, "maxOdds": 10, "betSorting": "Custom"}),
    "ACCOUNT": json.dumps([]),
    "PROXY": json.dumps([]),
    "GoogleCode": json.dumps([]),
    "Wallet": json.dumps([]),
    "Message": json.dumps({"telegramId": "", "pushOrderId": ""}),
    "Follow": json.dumps({}),
}
USER_SETTING_KEYS = [k for k in DEFAULT_USER_KV if k != "ACCOUNT"]


def _file_path(name: str) -> Path:
    return DATA_DIR / f"{name}.json"


def read_json(name: str, fallback=None):
    fp = _file_path(name)
    try:
        if not fp.exists():
            return fallback
        return json.loads(fp.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(name: str, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _file_path(name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000).hex()


def new_token() -> str:
    return secrets.token_hex(24)


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── seed ──────────────────────────────────────────────────────────────────────

def ensure_seed():
    users = read_json("users", None)
    if isinstance(users, list) and users:
        db_store.save_users(users)
    if not db_store.list_users():
        salt = secrets.token_hex(16)
        default_user = {
            "id": 1, "userName": "admin",
            "passwordHash": hash_password("admin", salt),
            "salt": salt, "setting": {},
        }
        db_store.save_users([default_user])
        if not users:
            write_json("users", [default_user])
        write_json("sessions", {})
        write_json("platforms", {})
        write_json("matches", {})
        write_json("bets", {})
        write_json("user_kv", dict(DEFAULT_USER_KV))
        write_json("live_timers", {})
        write_json("client_matchs", {"builtAt": 0, "count": 0, "info": []})
        write_json("tag_platforms", {})
        write_json("players", {})
        write_json("money_logs", {})
        write_json("player_orders", {})
        return

    kv = read_json("user_kv", {})
    changed = False
    for key, val in DEFAULT_USER_KV.items():
        if kv.get(key) is None:
            kv[key] = val
            changed = True
    if changed:
        write_json("user_kv", kv)

    if db_store.count_accounts() == 0:
        tj_user = get_user_by_name("TJ01")
        legacy_accounts = _parse_kv_content(kv.get("ACCOUNT"))
        if tj_user and isinstance(legacy_accounts, list) and legacy_accounts:
            db_store.replace_accounts_for_user(tj_user["id"], legacy_accounts)

    if db_store.count_user_settings() == 0:
        tj_user = get_user_by_name("TJ01")
        if tj_user:
            for key in USER_SETTING_KEYS:
                db_store.set_user_setting(tj_user["id"], key, kv.get(key) or DEFAULT_USER_KV.get(key, ""))


# ── users ─────────────────────────────────────────────────────────────────────

def get_user_by_name(user_name: str) -> dict | None:
    return db_store.get_user_by_name(user_name)


def get_user_by_id(user_id: int) -> dict | None:
    return db_store.get_user_by_id(user_id) or None


def create_user(user_name: str, password: str, setting: dict = None) -> dict | None:
    salt = secrets.token_hex(16)
    user = {
        "userName": user_name,
        "passwordHash": hash_password(password, salt),
        "salt": salt,
        "setting": {"a8UserName": user_name, "a8Password": password, **(setting or {})},
    }
    return db_store.create_user(user)


def update_user_setting(user_id: int, patch: dict) -> dict | None:
    return db_store.update_user_setting(user_id, patch)


def get_user_by_token(token: str) -> dict | None:
    if not token:
        return None
    sessions = read_json("sessions", {})
    session = sessions.get(token)
    if not session:
        return None
    return get_user_by_id(session.get("userId"))


def get_session(token: str):
    if not token:
        return None
    return read_json("sessions", {}).get(token)


def create_session(user_id: int, extra: dict = None) -> str:
    token = new_token()
    sessions = read_json("sessions", {})
    sessions[token] = {"userId": user_id, "createdAt": _now_ms(), **(extra or {})}
    write_json("sessions", sessions)
    return token


def remove_session(token: str):
    sessions = read_json("sessions", {})
    sessions.pop(token, None)
    write_json("sessions", sessions)


# ── platform ──────────────────────────────────────────────────────────────────

def get_platform(provider: str):
    return read_json("platforms", {}).get(provider)


def set_platform(provider: str, data: dict) -> dict:
    platforms = read_json("platforms", {})
    platforms[provider] = {**(platforms.get(provider) or {}), **data,
                           "provider": provider, "updatedAt": _now_ms()}
    write_json("platforms", platforms)
    return platforms[provider]


# ── matches / bets ────────────────────────────────────────────────────────────

def _prune_bets_for_provider(provider: str, active_match_ids: list):
    active = set(str(i) for i in active_match_ids)
    all_bets = read_json("bets", {})
    prefix = f"{provider}:"
    changed = False
    for key in list(all_bets.keys()):
        if not key.startswith(prefix):
            continue
        match_id = key[len(prefix):]
        if match_id not in active:
            del all_bets[key]
            changed = True
    if changed:
        write_json("bets", all_bets)


def save_matches(provider: str, matchs: list):
    all_matches = read_json("matches", {})
    now = _now_ms()
    next_matches: dict = {}
    lst = matchs if isinstance(matchs, list) else []
    prev = all_matches.get(provider)
    if not lst and prev and isinstance(prev, dict) and prev:
        return
    for m in lst:
        if not m or m.get("SourceMatchID") is None:
            continue
        start = normalize_epoch_ms(m.get("StartTime") or 0)
        if start > 0 and not a8_start_time_list_allowed(start):
            continue
        next_matches[str(m["SourceMatchID"])] = {**m, "provider": provider, "savedAt": now}
    all_matches[provider] = next_matches
    write_json("matches", all_matches)
    _prune_bets_for_provider(provider, list(next_matches.keys()))
    rebuild_client_match_list_now()


def _merge_bets_by_map(existing: list, incoming: list) -> list:
    by_map: dict = {}
    for b in (existing or []):
        name = str(b.get("BetName") or "")
        if "+" in name:
            continue
        by_map[int(b.get("Map") or 0)] = format_bet_odds(b)
    for b in (incoming or []):
        name = str(b.get("BetName") or "")
        if "+" in name:
            continue
        by_map[int(b.get("Map") or 0)] = format_bet_odds(b)
    return sorted(by_map.values(), key=lambda b: b.get("Map") or 0)


def save_bets(provider: str, match_id, bets):
    all_bets = read_json("bets", {})
    key = f"{provider}:{match_id}"
    existing = (all_bets.get(key) or {}).get("bets") or []
    raw = bets if isinstance(bets, list) else []
    incoming = [normalize_im_bet(b) for b in raw] if provider == "IM" else raw

    if not incoming:
        if existing:
            return
        all_bets[key] = {"provider": provider, "matchId": str(match_id), "bets": [], "savedAt": _now_ms()}
        write_json("bets", all_bets)
        schedule_rebuild_client_match_list()
        return

    merged = _merge_bets_by_map(existing, incoming)
    all_bets[key] = {"provider": provider, "matchId": str(match_id), "bets": merged, "savedAt": _now_ms()}
    write_json("bets", all_bets)
    schedule_rebuild_client_match_list()


def save_live_timer(provider: str, timer):
    all_timers = read_json("live_timers", {})
    all_timers[provider] = {"provider": provider, "timer": timer, "savedAt": _now_ms()}
    write_json("live_timers", all_timers)
    schedule_rebuild_client_match_list()


# ── user kv / settings ────────────────────────────────────────────────────────

def get_user_kv(key: str):
    return read_json("user_kv", {}).get(key)


def set_user_kv(key: str, content: str):
    kv = read_json("user_kv", {})
    kv[key] = content
    write_json("user_kv", kv)


def is_user_setting_key(key: str) -> bool:
    return key in USER_SETTING_KEYS


def get_user_setting(user_id: int, key: str):
    if not is_user_setting_key(key):
        return None
    return db_store.get_user_setting(user_id, key)


def set_user_setting(user_id: int, key: str, content: str):
    if not is_user_setting_key(key):
        set_user_kv(key, content)
        return
    db_store.set_user_setting(user_id, key, content or "")


# ── accounts ──────────────────────────────────────────────────────────────────

def get_accounts_for_user(user_id: int) -> list:
    return db_store.list_accounts_for_user(user_id)


def set_accounts_for_user(user_id: int, accounts: list) -> list:
    return db_store.replace_accounts_for_user(user_id, accounts)


def update_account_for_user(user_id: int, account_id, updates: dict):
    return db_store.update_account_for_user(user_id, account_id, updates)


def remove_account_for_user(user_id: int, account_id) -> bool:
    return db_store.remove_account_for_user(user_id, account_id)


# ── match list ────────────────────────────────────────────────────────────────

def rebuild_client_match_list_now() -> list:
    from esport_api.match_merge import build_client_match_list
    from esport_api.default_odds import record_from_match_list
    matches = read_json("matches", {})
    bets = read_json("bets", {})
    timers = read_json("live_timers", {})
    info = build_client_match_list(matches, bets, timers)
    write_json("client_matchs", {"builtAt": _now_ms(), "count": len(info), "info": info})
    db_store.save_client_matches(info)
    db_store.prune_client_matches([int(m["ID"]) for m in info])
    record_from_match_list(info)
    return info


def schedule_rebuild_client_match_list():
    global _rebuild_timer
    with _lock:
        if _rebuild_timer:
            _rebuild_timer.cancel()
        _rebuild_timer = threading.Timer(CLIENT_MATCHS_DEBOUNCE_MS, _do_rebuild)
        _rebuild_timer.daemon = True
        _rebuild_timer.start()


def _do_rebuild():
    global _rebuild_timer
    with _lock:
        _rebuild_timer = None
    try:
        rebuild_client_match_list_now()
    except Exception as e:
        print(f"[store] rebuild client_matchs failed: {e}")


def build_match_list() -> list:
    cached = read_json("client_matchs", None)
    if cached and isinstance(cached.get("info"), list):
        return cached["info"]
    return rebuild_client_match_list_now()


def _parse_kv_content(raw):
    if raw is None or raw == "":
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw
