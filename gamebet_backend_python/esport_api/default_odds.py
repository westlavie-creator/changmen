from esport_api import store as _store

_FILE = "default_odds"


def _read() -> dict:
    raw = _store.read_json(_FILE, {})
    return raw if isinstance(raw, dict) else {}


def _write(data: dict):
    _store.write_json(_FILE, data)


def record_from_match_list(matches: list):
    store = _read()
    changed = False
    for match in matches or []:
        for bet in match.get("Bets") or []:
            bid = bet.get("ID")
            if not bid:
                continue
            for src in (bet.get("Sources") or {}).values():
                home = float(src.get("HomeOdds") or 0)
                away = float(src.get("AwayOdds") or 0)
                if home > 0 and f"{bid}:Home" not in store:
                    store[f"{bid}:Home"] = home
                    changed = True
                if away > 0 and f"{bid}:Away" not in store:
                    store[f"{bid}:Away"] = away
                    changed = True
    if changed:
        _write(store)


def get_match_default_odds(match_ids: list, build_match_list_fn) -> dict:
    store = _read()
    result = {}
    match_list = None
    for mid in match_ids or []:
        key_h = f"{mid}:Home"
        key_a = f"{mid}:Away"
        if key_h in store or key_a in store:
            result[str(mid)] = {
                "Home": store.get(key_h, 0),
                "Away": store.get(key_a, 0),
            }
        else:
            if match_list is None:
                match_list = build_match_list_fn()
            for m in match_list:
                for bet in m.get("Bets") or []:
                    if str(bet.get("ID")) == str(mid):
                        for src in (bet.get("Sources") or {}).values():
                            result[str(mid)] = {
                                "Home": float(src.get("HomeOdds") or 0),
                                "Away": float(src.get("AwayOdds") or 0),
                            }
    return result


def get_default_odds_single(bet_id: int, team: str, build_match_list_fn) -> float:
    store = _read()
    key = f"{bet_id}:{team}"
    if key in store:
        return float(store[key])
    match_list = build_match_list_fn()
    for m in match_list:
        for bet in m.get("Bets") or []:
            if int(bet.get("ID") or 0) == bet_id:
                for src in (bet.get("Sources") or {}).values():
                    odds_key = "HomeOdds" if team == "Home" else "AwayOdds"
                    return float(src.get(odds_key) or 0)
    return 0.0
