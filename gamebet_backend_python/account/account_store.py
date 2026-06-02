import time
from esport_api import store as main_store

FILES = {
    "tagPlatforms": "tag_platforms",
    "players": "players",
    "moneyLogs": "money_logs",
    "playerOrders": "player_orders",
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _next_id(collection: dict) -> int:
    max_id = 0
    for row in collection.values():
        rid = int(row.get("id") or row.get("ID") or row.get("playerId") or 0)
        if rid > max_id:
            max_id = rid
    return max_id + 1


def ensure_seed():
    for key in FILES.values():
        if main_store.read_json(key, None) is None:
            main_store.write_json(key, {})


def list_tag_platforms() -> list:
    all_p = main_store.read_json(FILES["tagPlatforms"], {})
    return sorted([{"ID": r["id"], "Name": r["name"]} for r in all_p.values()], key=lambda x: x["ID"])


def find_tag_platform_by_name(name: str):
    all_p = main_store.read_json(FILES["tagPlatforms"], {})
    return next((r for r in all_p.values() if r.get("name") == name), None)


def create_tag_platform(platform_name: str, player_name: str) -> dict:
    platforms = main_store.read_json(FILES["tagPlatforms"], {})
    players = main_store.read_json(FILES["players"], {})

    platform = find_tag_platform_by_name(platform_name)
    if not platform:
        pid = _next_id(platforms)
        platform = {"id": pid, "name": platform_name, "createdAt": _now_ms()}
        platforms[str(pid)] = platform

    player_id = _next_id(players)
    player = {
        "id": player_id, "platformId": platform["id"], "platformName": platform["name"],
        "playerName": player_name or "", "credit": 0, "totalBalance": 0,
        "createdAt": _now_ms(), "updatedAt": _now_ms(),
    }
    players[str(player_id)] = player

    main_store.write_json(FILES["tagPlatforms"], platforms)
    main_store.write_json(FILES["players"], players)

    return {"playerId": player_id, "playerName": player["playerName"],
            "platformId": platform["id"], "platformName": platform["name"]}


def get_player(player_id) -> dict | None:
    players = main_store.read_json(FILES["players"], {})
    return players.get(str(player_id))


def update_player_balance(player_id, balance: float) -> dict | None:
    players = main_store.read_json(FILES["players"], {})
    key = str(player_id)
    row = players.get(key)
    if not row:
        return None
    row["totalBalance"] = float(balance)
    row["updatedAt"] = _now_ms()
    players[key] = row
    main_store.write_json(FILES["players"], players)
    return row


def delete_player(player_id, description: str = "") -> bool:
    players = main_store.read_json(FILES["players"], {})
    key = str(player_id)
    if key not in players:
        return False
    del players[key]
    main_store.write_json(FILES["players"], players)
    return True


def list_money_logs(player_id, page_index: int = 1, page_size: int = 20) -> dict:
    all_logs = main_store.read_json(FILES["moneyLogs"], {})
    logs = sorted(
        [v for v in all_logs.values() if str(v.get("playerId")) == str(player_id)],
        key=lambda x: x.get("createAt", 0), reverse=True,
    )
    total = len(logs)
    start = (page_index - 1) * page_size
    return {"data": logs[start:start + page_size], "total": total,
            "pageIndex": page_index, "pageSize": page_size}


def get_money_log(log_id) -> dict | None:
    return main_store.read_json(FILES["moneyLogs"], {}).get(str(log_id))


def save_money_log(body: dict) -> dict:
    all_logs = main_store.read_json(FILES["moneyLogs"], {})
    log_id = body.get("logId") or _next_id(all_logs)
    row = {**body, "logId": log_id, "createAt": body.get("createAt") or _now_ms()}
    all_logs[str(log_id)] = row
    main_store.write_json(FILES["moneyLogs"], all_logs)
    return row


def delete_money_log(log_id) -> bool:
    all_logs = main_store.read_json(FILES["moneyLogs"], {})
    key = str(log_id)
    if key not in all_logs:
        return False
    del all_logs[key]
    main_store.write_json(FILES["moneyLogs"], all_logs)
    return True


def save_player_orders(player_id, order_type: str, orders: list):
    all_orders = main_store.read_json(FILES["playerOrders"], {})
    all_orders[str(player_id)] = {"playerId": player_id, "type": order_type,
                                   "orders": orders, "savedAt": _now_ms()}
    main_store.write_json(FILES["playerOrders"], all_orders)


def list_by_player(player_id) -> list:
    all_orders = main_store.read_json(FILES["playerOrders"], {})
    block = all_orders.get(str(player_id))
    return block.get("orders", []) if block else []


def get_accounts_from_kv() -> list:
    raw = main_store.get_user_kv("ACCOUNT")
    if not raw:
        return []
    try:
        import json
        return json.loads(raw) if isinstance(raw, str) else (raw if isinstance(raw, list) else [])
    except Exception:
        return []
