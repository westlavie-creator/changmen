import json
import re
import time
from account import account_store
from esport_api import store as main_store


def _now_ms() -> int:
    return int(time.time() * 1000)


def handle_create_tag_platform(body: dict) -> dict:
    platform_name = body.get("platform") or body.get("platformName") or ""
    player_name = body.get("playerName") or ""
    if not platform_name or not player_name:
        return {"ok": False, "msg": "platform 与 playerName 必填"}
    created = account_store.create_tag_platform(platform_name, player_name)
    return {"ok": True, "info": created}


def handle_get_tag_platforms() -> dict:
    return {"ok": True, "info": account_store.list_tag_platforms()}


def handle_update_balance(body: dict) -> dict:
    player_id = body.get("playerId")
    try:
        balance = float(body.get("balance"))
    except (TypeError, ValueError):
        return {"ok": False, "msg": "playerId 与 balance 必填"}
    if not player_id:
        return {"ok": False, "msg": "playerId 与 balance 必填"}
    player = account_store.get_player(player_id)
    if not player:
        return {"ok": False, "msg": "player 不存在"}
    info = account_store.update_player_balance(player_id, balance)
    return {"ok": True, "info": info}


def handle_delete_player(body: dict, user_id: int) -> dict:
    player_id = body.get("playerId")
    if not player_id:
        return {"ok": False, "msg": "playerId 必填"}
    ok = account_store.delete_player(player_id, body.get("description") or "")
    if ok:
        main_store.remove_account_for_user(user_id, player_id)
    return {"ok": ok, "info": True} if ok else {"ok": False, "msg": "player 不存在"}


def handle_get_money_logs(body: dict) -> dict:
    player_id = body.get("playerId")
    if not player_id:
        return {"ok": False, "msg": "playerId 必填"}
    page_index = int(body.get("pageIndex") or 1)
    page_size = int(body.get("pageSize") or 20)
    return {"ok": True, "info": account_store.list_money_logs(player_id, page_index, page_size)}


def handle_get_money_log(body: dict) -> dict:
    row = account_store.get_money_log(body.get("logId"))
    return {"ok": True, "info": row}


def handle_save_money_log(body: dict) -> dict:
    row = account_store.save_money_log(body)
    return {"ok": True, "info": row}


def handle_delete_money_log(body: dict) -> dict:
    ok = account_store.delete_money_log(body.get("logId"))
    return {"ok": ok, "info": True} if ok else {"ok": False, "msg": "log 不存在"}


def handle_get_player_order(body: dict) -> dict:
    player_id = body.get("playerId")
    if not player_id:
        return {"ok": False, "msg": "playerId 必填"}
    page = account_store.list_money_logs(player_id, 1, 10000)
    logs = [{
        "ID": r.get("logId"), "Type": r.get("type"), "Money": float(r.get("money") or 0),
        "Currency": r.get("currency") or "CNY", "Description": r.get("description") or "",
        "IsAuto": 1 if re.search(r"\d+sec|\d+s$", r.get("description") or "", re.IGNORECASE) else 0,
        "CreateAt": r.get("createAt") or 0,
    } for r in page.get("data") or []]
    orders = account_store.list_by_player(player_id)
    return {"ok": True, "info": {"logs": logs, "orders": orders}}


def handle_save_order(body: dict) -> dict:
    player_id = body.get("playerId")
    if not player_id:
        return {"ok": False, "msg": "playerId 必填"}
    try:
        orders = json.loads(body.get("orders") or "[]")
    except Exception:
        return {"ok": False, "msg": "orders JSON 无效"}
    account_store.save_player_orders(player_id, body.get("type") or body.get("provider") or "", orders)
    return {"ok": True, "info": True}


def handle_save_order_bind(body: dict) -> dict:
    return {"ok": True, "info": True}


def handle_get_order_list(body: dict) -> dict:
    return {"ok": True, "info": {"data": [], "total": 0}}


def handle_get_users() -> dict:
    from db import store as db_store
    users = db_store.list_users()
    return {"info": [{"ID": u["id"], "UserName": u["userName"]} for u in users]}


def handle_save_data(key: str, content: str, user_id: int) -> dict:
    from esport_api.user_kv import is_array_key, wrap_object_direct
    main_store.set_user_setting(user_id, key, content)
    return {"ok": True, "info": content}


def handle_get_data(key: str, user_id: int) -> dict:
    from esport_api.user_kv import is_array_key, empty_direct_value
    val = main_store.get_user_setting(user_id, key)
    if val is None:
        val = main_store.get_user_kv(key)
    if val is None:
        val = ""
    try:
        parsed = json.loads(val) if isinstance(val, str) and val else val
    except Exception:
        parsed = val
    if isinstance(parsed, (list, dict)):
        return {"direct": parsed}
    return {"info": val}


def handle_refresh_account_balance(body: dict, user_id: int) -> dict:
    return {"ok": True, "info": []}
