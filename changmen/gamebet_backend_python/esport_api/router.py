import json
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from esport_api import store
from account import account_store, account_service
from shared.game_catalog import list_games, get_catalog_summary


def ok(info=None, msg="ok"):
    return {"success": 1, "msg": msg, "info": info}


def fail(msg: str, info=None):
    return {"success": 0, "msg": msg, "info": info}


async def _read_body(request: Request) -> dict:
    ct = request.headers.get("content-type", "")
    raw = await request.body()
    raw_str = raw.decode("utf-8", errors="replace")
    if "application/json" in ct:
        try:
            return json.loads(raw_str) if raw_str else {}
        except Exception:
            return {}
    if "application/x-www-form-urlencoded" in ct or "=" in raw_str:
        from urllib.parse import parse_qs
        parsed = parse_qs(raw_str, keep_blank_values=True)
        return {k: v[0] for k, v in parsed.items()}
    return {"_raw": raw_str} if raw_str else {}


def _action_from_path(path: str) -> str:
    base = path.replace("/esport/", "").split("?")[0]
    return base.lstrip("/")


def _games_for_provider(provider: str) -> list:
    from shared.game_catalog import _catalog
    ids = set()
    for g in _catalog.get("games", []):
        pid = g.get("platforms", {}).get(provider)
        if pid:
            ids.add(str(pid))
    return list(ids)


async def _handle_client_login(body: dict) -> dict:
    user_name = body.get("userName") or body.get("username")
    password = body.get("password")
    if user_name and password:
        user = store.get_user_by_name(user_name)
        if user and user.get("salt"):
            h = store.hash_password(password, user["salt"])
            if h == user["passwordHash"]:
                token = store.create_session(user["id"])
                return ok({"token": token, "userName": user["userName"], "ID": user["id"]})
    return fail("用户名或密码错误")


async def handle(action: str, body: dict, ctx: dict) -> dict | list:
    user = ctx.get("user")
    token = ctx.get("token")

    if action == "Client_Logout":
        if token:
            store.remove_session(token)
        return ok(None)

    if action == "Client_GetUserInfo":
        if not user:
            return fail("请先登录")
        return ok({"ID": user["id"], "UserName": user["userName"], "Setting": user.get("setting") or {}})

    if action == "Client_UpdateSetting":
        if not user:
            return fail("请先登录")
        patch = body.get("setting") or body
        if isinstance(patch, str):
            try:
                patch = json.loads(patch)
            except Exception:
                return fail("invalid setting json")
        if not patch or not isinstance(patch, dict) or isinstance(patch, list):
            return fail("setting required")
        u = store.update_user_setting(user["id"], patch)
        return ok(u.get("setting") or {} if u else {})

    if action == "Client_GetCollectPlatform":
        if not user:
            return fail("请先登录")
        provider = body.get("provider", "")
        row = store.get_platform(provider)
        if not row:
            return ok({"Gateway": "", "Token": "", "BetName": ".*"})
        bet_name = row.get("betName") or ".*"
        gateway = row.get("gateway") or ""
        token_val = row.get("token") or ""
        out = {"Gateway": gateway, "Token": token_val, "BetName": bet_name}
        if str(provider).upper() == "OB" and row.get("gameOddTypes"):
            out["GameOddTypes"] = row["gameOddTypes"]
        return ok(out)

    if action == "Client_GetGames":
        if not user:
            return fail("请先登录")
        provider = body.get("provider", "")
        from_catalog = _games_for_provider(provider)
        row = store.get_platform(provider)
        from_platform = [str(g) for g in (row.get("games") or [])] if row else []
        merged = list(set(from_catalog + from_platform))
        return ok(merged)

    if action == "API_UpdatePlatform":
        if not user:
            return fail("请先登录")
        provider = body.get("provider")
        if not provider:
            return fail("provider required")
        prev = store.get_platform(provider) or {}
        games = body.get("games")
        if games:
            try:
                games = json.loads(games)
            except Exception:
                games = prev.get("games")
        next_p = store.set_platform(provider, {
            "gateway": body.get("gateway", prev.get("gateway", "")),
            "token": body.get("token", prev.get("token", "")),
            "betName": body.get("betName", prev.get("betName", ".*")),
            "games": games if games is not None else prev.get("games"),
        })
        return ok(next_p)

    if action == "API_SaveMatch":
        if not user:
            return fail("请先登录")
        provider = body.get("provider")
        try:
            matchs = json.loads(body.get("matchs") or "[]")
        except Exception:
            return fail("invalid matchs json")
        store.save_matches(provider, matchs)
        return ok(True)

    if action == "API_SaveBet":
        if not user:
            return fail("请先登录")
        provider = body.get("provider")
        match_id = body.get("matchId")
        try:
            bets = json.loads(body.get("bets") or "[]")
        except Exception:
            return fail("invalid bets json")
        store.save_bets(provider, match_id, bets)
        return ok(True)

    if action == "API_SaveLiveTimer":
        if not user:
            return fail("请先登录")
        provider = body.get("provider")
        try:
            timer = json.loads(body.get("timer") or "[]")
        except Exception:
            return fail("invalid timer json")
        store.save_live_timer(provider, timer)
        return ok(True)

    if action == "Client_GetMatchs":
        if not user:
            return fail("请先登录")
        return ok(store.build_match_list())

    if action == "Client_SaveData":
        if not user:
            return fail("请先登录")
        if not body.get("key"):
            return fail("key required")
        saved = account_service.handle_save_data(body["key"], body.get("content") or "", user["id"])
        return ok(saved["info"]) if saved["ok"] else fail(saved["msg"])

    if action == "Client_GetData":
        if not user:
            return fail("请先登录")
        data = account_service.handle_get_data(body.get("key",""), user["id"])
        if isinstance(data.get("direct"), (list, dict)):
            return data["direct"]
        return ok(data.get("info"))

    if action == "Client_GetUserDetail":
        if not user:
            return fail("请先登录")
        return ok({"Id": user["id"]})

    if action == "Client_GetOrderList":
        if not user:
            return fail("请先登录")
        page = account_service.handle_get_order_list(body)
        return ok(page["info"]) if page["ok"] else fail(page["msg"])

    if action == "Client_SaveOrder":
        if not user:
            return fail("请先登录")
        saved = account_service.handle_save_order(body)
        return ok(saved["info"]) if saved["ok"] else fail(saved["msg"])

    if action == "Client_SaveOrderBind":
        if not user:
            return fail("请先登录")
        saved = account_service.handle_save_order_bind(body)
        return ok(saved["info"]) if saved["ok"] else fail(saved["msg"])

    if action == "API_SaveScore":
        if not user:
            return fail("请先登录")
        return ok(True)

    if action == "Client_SaveMoneyLog":
        if not user:
            return fail("请先登录")
        saved = account_service.handle_save_money_log(body)
        return ok(saved["info"]) if saved["ok"] else fail(saved["msg"])

    if action == "Client_DeleteMoneyLog":
        if not user:
            return fail("请先登录")
        deleted = account_service.handle_delete_money_log(body)
        return ok(deleted["info"]) if deleted["ok"] else fail(deleted["msg"])

    if action == "Client_DeletePlayer":
        if not user:
            return fail("请先登录")
        deleted = account_service.handle_delete_player(body, user["id"])
        return ok(deleted["info"]) if deleted["ok"] else fail(deleted["msg"])

    if action == "Client_UpdateBalance":
        if not user:
            return fail("请先登录")
        updated = account_service.handle_update_balance(body)
        return ok(updated["info"]) if updated["ok"] else fail(updated["msg"])

    if action == "Client_RefreshAccountBalance":
        if not user:
            return fail("请先登录")
        refreshed = await account_service.handle_refresh_account_balance(body, user["id"])
        return ok(refreshed["info"]) if refreshed["ok"] else fail(refreshed["msg"])

    if action == "Client_GetMoneyLogs":
        if not user:
            return fail("请先登录")
        page = account_service.handle_get_money_logs(body)
        return ok(page["info"]) if page["ok"] else fail(page["msg"])

    if action == "Client_GetMoneyLog":
        if not user:
            return fail("请先登录")
        row = account_service.handle_get_money_log(body)
        return ok(row["info"]) if row["ok"] else fail(row["msg"])

    if action == "Client_MonthReport":
        if not user:
            return fail("请先登录")
        return ok([])

    if action == "Client_GetUserProfit":
        if not user:
            return fail("请先登录")
        accounts = account_store.get_accounts_from_kv()
        rows = [{"UserID": a.get("accountId"), "UserName": a.get("playerName") or a.get("platformName") or str(a.get("accountId","")),
                 "Money": 0, "Count": 0, "BetMoney": 0} for a in accounts]
        return ok(rows)

    if action == "Client_GetDefaultOdds":
        if not user:
            return fail("请先登录")
        bet_id = int(body.get("betId") or 0)
        team = str(body.get("team") or "")
        if not bet_id or team not in ("Home", "Away"):
            return fail("betId / team 无效")
        from esport_api.default_odds import get_default_odds_single
        odds = get_default_odds_single(bet_id, team, store.build_match_list)
        return ok({"odds": odds})

    if action == "Client_GetMatchDefaultOdds":
        if not user:
            return fail("请先登录")
        try:
            match_ids = json.loads(body.get("matchs") or "[]")
        except Exception:
            return fail("matchs JSON 无效")
        from esport_api.default_odds import get_match_default_odds
        return ok(get_match_default_odds(match_ids, store.build_match_list))

    if action == "Client_CreateTagPlatform":
        if not user:
            return fail("请先登录")
        account_store.ensure_seed()
        created = account_service.handle_create_tag_platform(body)
        return ok(created["info"]) if created["ok"] else fail(created["msg"])

    if action == "Client_GetTagPlatforms":
        if not user:
            return fail("请先登录")
        account_store.ensure_seed()
        tags = account_service.handle_get_tag_platforms()
        return ok(tags["info"])

    if action == "Client_GetPlayerOrder":
        if not user:
            return fail("请先登录")
        orders = account_service.handle_get_player_order(body)
        return ok(orders["info"]) if orders["ok"] else fail(orders["msg"])

    if action == "Client_GetUsers":
        if not user:
            return fail("请先登录")
        users = account_service.handle_get_users()
        return ok(users["info"])

    if action == "Client_GetChatHistory":
        if not user:
            return fail("请先登录")
        return ok([])

    if action in ("Client_SaveUserLog", "SendMessage"):
        return ok(True)

    return fail(f"unknown action: {action}")


async def try_esport_api(request: Request) -> JSONResponse | None:
    path = request.url.path

    if path.startswith("/esport/"):
        action = _action_from_path(path)
        try:
            store.ensure_seed()
            account_store.ensure_seed()
            if not action:
                return JSONResponse(fail("missing action"), status_code=404)
            if request.method not in ("POST", "GET"):
                return JSONResponse(fail("method not allowed"), status_code=405)

            body = {}
            if request.method == "POST":
                body = await _read_body(request)

            token = request.headers.get("token") or request.headers.get("Token")
            user = store.get_user_by_token(token)

            if action == "Client_Login":
                result = await _handle_client_login(body)
                return JSONResponse(result)

            result = await handle(action, body, {"token": token, "user": user})
            return JSONResponse(result)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JSONResponse(fail(str(e) or "服务器错误"))

    if path in ("/IP", "/IP/Address"):
        if path == "/IP/Address" and request.method != "POST":
            return JSONResponse(fail("method not allowed"), status_code=405)
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() \
             or request.client.host if request.client else "127.0.0.1"
        if path == "/IP/Address":
            raw = await request.body()
            try:
                body_list = json.loads(raw.decode()) if raw else []
            except Exception:
                body_list = []
            info = {str(i): str(i) for i in body_list}
            return JSONResponse(ok(info))
        return JSONResponse(ok({"IP": ip, "Address": "本地" if ip == "127.0.0.1" else ip}))

    return None
