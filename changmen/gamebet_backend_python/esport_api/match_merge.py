import re
import os
from shared.odds_format import format_odds
from shared.match_time import normalize_epoch_ms, a8_start_time_list_allowed, now_ms, IM_ODDS_ACTIVE_MS, A8_MATCH_MAX_FUTURE_MS
from shared.game_catalog import resolve_client_game, describe_platform_game, get_game_code_for_platform_id, get_platform_game_id
from shared.im_parse import normalize_im_bet, pick_str, im_bet_name_is_collectible

MERGE_MODE = os.environ.get("ESPORT_MATCH_MERGE_MODE", "accumulate")
IM_ENRICH_WINDOW_MS = 3 * 60 * 60 * 1000

OB_WIN_BET_RE = re.compile(r"(\[全场\].+获胜)|(\[地图\d+\].+获胜)|(.+全局.+获胜)|(.+单局.+获胜)")
RAY_WIN_GROUP_RE = re.compile(r"^获胜者$")


def _stable_id(seed) -> int:
    h = 0
    for c in str(seed):
        h = ((31 * h) + ord(c)) & 0xFFFFFFFF
    return h or 1


def _format_title(home, away) -> str:
    h = str(home or "").strip()
    a = str(away or "").strip()
    if h and a:
        return f"{h} vs {a}"
    return h or a or "Unknown"


def _bet_key(provider: str, source_match_id) -> str:
    return f"{provider}:{source_match_id}"


def _is_placeholder(name) -> bool:
    t = str(name or "").strip()
    return not t or t in ("主队", "客队", "Unknown")


def _ob_saved_bet_is_match_winner(bet: dict, game_code: str) -> bool:
    name = str(bet.get("BetName") or "")
    return bool(OB_WIN_BET_RE.search(name))


def _matches_saved_bet(provider: str, bet: dict, game_code: str) -> bool:
    if provider == "OB":
        name = str(bet.get("BetName") or "")
        if "+" in name:
            return False
        return _ob_saved_bet_is_match_winner(bet, game_code) or bool(OB_WIN_BET_RE.search(name))
    if provider == "RAY":
        group = str(bet.get("GroupName") or "")
        return bool(RAY_WIN_GROUP_RE.search(group))
    if provider == "IM":
        name = pick_str(bet, "BetName", "Name", "name", "betName")
        if name and not im_bet_name_is_collectible(name):
            return False
        return True
    return True


def _win_bet_priority(bet: dict, provider: str, game_code: str) -> int:
    name = str(bet.get("BetName") or bet.get("Name") or "")
    group = str(bet.get("GroupName") or "")
    if "+" in name:
        return 0
    if provider == "OB" and game_code and _ob_saved_bet_is_match_winner(bet, game_code):
        return 200
    if provider == "RAY" and RAY_WIN_GROUP_RE.search(group):
        return 100
    if provider == "OB" and OB_WIN_BET_RE.search(name):
        return 100
    if bet.get("OddTypeID"):
        return 90
    if RAY_WIN_GROUP_RE.search(group):
        return 90
    return 0


def _dedupe_win_bets_by_map(bets: list, provider: str, game_code: str) -> list:
    by_map: dict = {}
    for bet in bets:
        m = bet.get("Map", 0)
        prev = by_map.get(m)
        if prev is None or _win_bet_priority(bet, provider, game_code) > _win_bet_priority(prev, provider, game_code):
            by_map[m] = bet
    return sorted(by_map.values(), key=lambda b: b.get("Map", 0))


def _filter_stored_win_bets(bets: list, provider: str, game_code: str) -> list:
    result = []
    for bet in bets or []:
        if provider == "OB":
            name = str(bet.get("BetName") or "")
            if "+" in name:
                continue
            if game_code and _matches_saved_bet("OB", bet, game_code):
                result.append(bet)
            elif OB_WIN_BET_RE.search(name):
                result.append(bet)
        elif provider == "RAY":
            if _matches_saved_bet("RAY", bet, game_code):
                result.append(bet)
        elif provider == "IM":
            name = pick_str(bet, "BetName", "Name", "name", "betName")
            if name and not im_bet_name_is_collectible(name):
                continue
            if _matches_saved_bet("IM", bet, game_code):
                result.append(bet)
        else:
            result.append(bet)
    return result


def _dedupe_im_bets_by_map(bets: list) -> list:
    by_map: dict = {}
    for bet in bets:
        row = normalize_im_bet(bet)
        m = row.get("Map", 0)
        prev = by_map.get(m)
        if prev is None:
            by_map[m] = row
        elif str(row.get("SourceBetID","")) > str(prev.get("SourceBetID","")):
            by_map[m] = row
    return sorted(by_map.values(), key=lambda b: b.get("Map", 0))


def _source_from_bet(provider: str, bet: dict) -> dict:
    from shared.odds_format import format_odds as fo
    return {
        "Type": provider,
        "BetID": str(bet.get("SourceBetID") or ""),
        "HomeID": str(bet.get("SourceHomeID") or ""),
        "AwayID": str(bet.get("SourceAwayID") or ""),
        "HomeOdds": fo(bet.get("HomeOdds")),
        "AwayOdds": fo(bet.get("AwayOdds")),
        "Status": bet.get("Status") or "Normal",
    }


def _build_bet_row(provider: str, source_match_id, client_match_id: int,
                   bet: dict, match_teams: dict | None) -> dict:
    row = normalize_im_bet(bet) if provider == "IM" else bet
    m = row.get("Map", 0)
    seed = f"{provider}:{source_match_id}:{m}"
    bet_row_id = _stable_id(f"bet:{seed}")
    home_id = _stable_id(f"home:{seed}")
    away_id = _stable_id(f"away:{seed}")
    match_home = (match_teams or {}).get("home", "")
    match_away = (match_teams or {}).get("away", "")

    def pick_team(bet_name, from_match):
        if from_match and not _is_placeholder(from_match):
            return from_match
        if bet_name and not _is_placeholder(bet_name):
            return bet_name
        return from_match or bet_name or ""

    return {
        "ID": bet_row_id,
        "MatchID": client_match_id,
        "Map": m,
        "Name": row.get("BetName") or "",
        "HomeID": home_id,
        "HomeName": pick_team(row.get("HomeName",""), match_home) if provider == "IM" else row.get("HomeName",""),
        "AwayID": away_id,
        "AwayName": pick_team(row.get("AwayName",""), match_away) if provider == "IM" else row.get("AwayName",""),
        "Status": row.get("Status") or "Normal",
        "Sources": {provider: _source_from_bet(provider, row)},
    }


def _build_bets_for_match(provider: str, source_match_id, client_match_id: int,
                           bets: dict, game_code: str, match_teams: dict | None) -> list:
    stored = bets.get(_bet_key(provider, source_match_id))
    if not stored or not stored.get("bets"):
        return []
    if provider == "IM":
        win_bets = _dedupe_im_bets_by_map(
            [b for b in stored["bets"] if _matches_saved_bet("IM", b, game_code)]
        )
    else:
        win_bets = _dedupe_win_bets_by_map(
            _filter_stored_win_bets(stored["bets"], provider, game_code),
            provider, game_code,
        )
    return [_build_bet_row(provider, source_match_id, client_match_id, b, match_teams) for b in win_bets]


def _live_round(timers: dict, provider: str, source_match_id) -> dict:
    block = timers.get(provider)
    arr = block.get("timer") if block else None
    if not isinstance(arr, list):
        return {"round": 0, "roundStart": 0}
    sid = str(source_match_id)
    for x in arr:
        match_id = str(x.get("matchId") or x.get("SourceMatchID") or x.get("MatchID") or "")
        if match_id == sid:
            return {
                "round": int(x.get("round") or x.get("Round") or x.get("Map") or x.get("roundId") or 0),
                "roundStart": int(x.get("startTime") or x.get("StartTime") or x.get("RoundStart") or 0),
            }
    return {"round": 0, "roundStart": 0}


def _im_match_is_stale(match: dict, bets_block) -> bool:
    start = normalize_epoch_ms(match.get("StartTime"))
    if start > 0 and not a8_start_time_list_allowed(start):
        return True
    saved_at = int(bets_block.get("savedAt") if bets_block else 0) or int(match.get("savedAt") or 0)
    if saved_at > 0 and now_ms() - saved_at > IM_ODDS_ACTIVE_MS:
        return True
    if start > 0 and start > now_ms() + A8_MATCH_MAX_FUTURE_MS:
        return True
    return False


def _build_team_enrich_index(matches: dict) -> list:
    rows = []
    for provider, by_id in (matches or {}).items():
        if provider == "IM" or not by_id or not isinstance(by_id, dict):
            continue
        for m in by_id.values():
            if not m or not m.get("SourceMatchID"):
                continue
            if _is_placeholder(m.get("Home")) or _is_placeholder(m.get("Away")):
                continue
            teams = m.get("Teams") or []
            native_game_id = str(m.get("SourceGameID") or "").strip()
            game_code = get_game_code_for_platform_id(provider, native_game_id)
            im_source_game_id = get_platform_game_id("IM", game_code) if game_code else ""
            rows.append({
                "start": normalize_epoch_ms(m.get("StartTime")),
                "home": str(m.get("Home","")).strip(),
                "away": str(m.get("Away","")).strip(),
                "homeId": m.get("HomeID"),
                "awayId": m.get("AwayID"),
                "homeLogo": (teams[0].get("Logo") if teams else "") or "",
                "awayLogo": (teams[1].get("Logo") if len(teams) > 1 else "") or "",
                "sourceGameId": native_game_id,
                "imSourceGameId": im_source_game_id,
                "teams": teams,
            })
    return rows


def _enrich_im_match(match: dict, team_index: list) -> dict:
    need_teams = _is_placeholder(match.get("Home")) or _is_placeholder(match.get("Away"))
    need_game = not match.get("SourceGameID") or str(match.get("SourceGameID","")).strip() == "unknown"
    if not need_teams and not need_game:
        return match

    st = normalize_epoch_ms(match.get("StartTime"))
    home_key = str(match.get("Home","")).strip().lower()
    away_key = str(match.get("Away","")).strip().lower()
    best = None

    if home_key and away_key and not _is_placeholder(match.get("Home")) and not _is_placeholder(match.get("Away")):
        for row in team_index:
            if (row["home"].lower() == home_key and row["away"].lower() == away_key) or \
               (row["home"].lower() == away_key and row["away"].lower() == home_key):
                best = row
                break

    if not best:
        best_gap = IM_ENRICH_WINDOW_MS + 1
        for row in team_index:
            if not st or not row["start"]:
                continue
            gap = abs(row["start"] - st)
            if gap < best_gap:
                best_gap = gap
                best = row
        if not best or best_gap > IM_ENRICH_WINDOW_MS:
            return match

    home_id = str(match.get("HomeID") or "")
    away_id = str(match.get("AwayID") or "")
    home = best["home"] if need_teams and _is_placeholder(match.get("Home")) else match.get("Home","")
    away = best["away"] if need_teams and _is_placeholder(match.get("Away")) else match.get("Away","")
    source_game_id = best["imSourceGameId"] if need_game and best.get("imSourceGameId") else match.get("SourceGameID","")
    teams = match.get("Teams") or [
        {"Type": "IM", "GameID": source_game_id, "Name": home,
         "TeamID": best["homeId"] if "-home" in home_id else match.get("HomeID"), "Logo": best["homeLogo"]},
        {"Type": "IM", "GameID": source_game_id, "Name": away,
         "TeamID": best["awayId"] if "-away" in away_id else match.get("AwayID"), "Logo": best["awayLogo"]},
    ]
    return {**match, "Home": home, "Away": away, "SourceGameID": source_game_id,
            "StartTime": st or normalize_epoch_ms(best["start"]) or match.get("StartTime"),
            "HomeID": best["homeId"] if "-home" in home_id else match.get("HomeID"),
            "AwayID": best["awayId"] if "-away" in away_id else match.get("AwayID"),
            "Teams": teams}


def _build_accumulate_row(provider: str, match: dict, bets: dict, timers: dict) -> dict:
    source_match_id = str(match.get("SourceMatchID",""))
    client_match_id = _stable_id(f"match:{provider}:{source_match_id}")
    lr = _live_round(timers, provider, source_match_id)
    source_game_id = match.get("SourceGameID") or match.get("GameID","")
    game_info = resolve_client_game(provider, source_game_id)
    game_code = describe_platform_game(provider, source_game_id).get("gameCode","")
    match_teams = {"home": str(match.get("Home","")).strip(), "away": str(match.get("Away","")).strip()} if provider == "IM" else None
    return {
        "ID": client_match_id,
        "Title": _format_title(match.get("Home"), match.get("Away")),
        "StartTime": normalize_epoch_ms(match.get("StartTime")),
        "Game": game_info.get("Game",""),
        "GameID": game_info.get("GameID",""),
        "BO": int(match.get("BO") or 0),
        "Matchs": {provider: source_match_id},
        "Bets": _build_bets_for_match(provider, source_match_id, client_match_id, bets, game_code, match_teams),
        "Round": lr["round"],
        "RoundStart": lr["roundStart"],
        "Reverse": match.get("Reverse") if isinstance(match.get("Reverse"), list) else [],
    }


def _collapse_im_client_rows(rows: list) -> list:
    im_rows = [r for r in rows if r.get("Matchs", {}).get("IM")]
    other = [r for r in rows if not r.get("Matchs", {}).get("IM")]
    by_key: dict = {}
    for row in im_rows:
        title = str(row.get("Title","")).strip().lower()
        placeholder = "主队" in title or "客队" in title
        key = f"ph:{row.get('GameID','')}" if placeholder else f"{title}|{row.get('GameID','')}"
        prev = by_key.get(key)
        if prev is None:
            by_key[key] = row
        else:
            pick = row if len(row["Bets"]) > len(prev["Bets"]) or (
                len(row["Bets"]) == len(prev["Bets"]) and row["StartTime"] > prev["StartTime"]) else prev
            by_key[key] = pick
    return sorted([*other, *by_key.values()], key=lambda r: r.get("StartTime", 0))


def build_client_match_list(matches: dict, bets: dict, timers: dict) -> list:
    team_index = _build_team_enrich_index(matches)
    result = []
    for provider, by_id in (matches or {}).items():
        if not by_id or not isinstance(by_id, dict):
            continue
        for match in by_id.values():
            if not match or not match.get("SourceMatchID"):
                continue
            start_ms = normalize_epoch_ms(match.get("StartTime"))
            if start_ms > 0 and not a8_start_time_list_allowed(start_ms):
                continue
            if provider == "IM":
                block = bets.get(_bet_key("IM", match.get("SourceMatchID","")))
                if _im_match_is_stale(match, block):
                    continue
                enriched = _enrich_im_match(match, team_index)
                unknown_game = not enriched.get("SourceGameID") or str(enriched.get("SourceGameID","")).strip() == "unknown"
                if _is_placeholder(enriched.get("Home")) and _is_placeholder(enriched.get("Away")) and unknown_game:
                    continue
                result.append(_build_accumulate_row(provider, enriched, bets, timers))
            else:
                result.append(_build_accumulate_row(provider, match, bets, timers))

    result.sort(key=lambda r: r.get("StartTime", 0))
    return _collapse_im_client_rows(result)
