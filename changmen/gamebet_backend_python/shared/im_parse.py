import re

CN_DIGIT = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
            "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def pick_str(obj: dict, *keys) -> str:
    if not obj or not isinstance(obj, dict):
        return ""
    for k in keys:
        v = obj.get(k)
        if v is not None and v != "":
            return str(v)
    return ""


def im_bet_name_is_full_match(name: str) -> bool:
    text = re.sub(r"\s+", "", str(name or ""))
    if not text:
        return False
    if re.search(r"全场|总比赛|系列赛|BO\d", text, re.IGNORECASE):
        return True
    if (re.search(r"比赛.*胜|胜负", text) or re.search(r"获胜", text)) and not re.search(r"第.+局", text):
        return True
    return False


def parse_im_map_from_bet_name(name: str) -> int:
    text = re.sub(r"\s+", "", str(name or ""))
    if not text or im_bet_name_is_full_match(name):
        return 0
    m = re.search(r"第([一二三四五六七八九十\d]+)局", text)
    if not m:
        return 0
    token = m.group(1)
    if re.match(r"^\d+$", token):
        return int(token) or 0
    if len(token) == 1:
        return CN_DIGIT.get(token, 0)
    if token == "十":
        return 10
    if token.startswith("十") and len(token) == 2:
        return CN_DIGIT.get(token[1], 0)
    if token.endswith("十") and len(token) == 2:
        return CN_DIGIT.get(token[0], 0) * 10
    return 0


def im_bet_name_is_map_winner(name: str) -> bool:
    text = str(name or "")
    if not text or im_bet_name_is_full_match(name):
        return False
    return bool(re.search(r"第\s*.+\s*局.*胜", text) or re.search(r"局.*胜利", text))


def im_bet_name_is_collectible(name: str) -> bool:
    if not name:
        return True
    return im_bet_name_is_full_match(name) or im_bet_name_is_map_winner(name)


def resolve_im_map(bet: dict) -> int:
    explicit = bet.get("Map")
    if explicit is not None:
        try:
            return int(explicit)
        except (TypeError, ValueError):
            pass
    name = pick_str(bet, "BetName", "Name", "name", "betName")
    return parse_im_map_from_bet_name(name)


def normalize_im_bet(bet: dict) -> dict:
    if not bet or not isinstance(bet, dict):
        return bet
    from shared.odds_format import format_odds
    name = pick_str(bet, "BetName", "Name", "name", "betName")
    map_num = resolve_im_map(bet)
    home_name = pick_str(bet, "HomeName", "homeName", "home_name", "Home", "home")
    away_name = pick_str(bet, "AwayName", "awayName", "away_name", "Away", "away")
    home_id = pick_str(bet, "SourceHomeID", "HomeID", "homeId", "home_id")
    away_id = pick_str(bet, "SourceAwayID", "AwayID", "awayId", "away_id")
    bet_id = pick_str(bet, "SourceBetID", "BetID", "betId", "bet_id", "id")
    status = pick_str(bet, "Status", "status") or "Normal"
    home_odds = format_odds(bet.get("HomeOdds") or bet.get("homeOdds") or bet.get("home_odds"))
    away_odds = format_odds(bet.get("AwayOdds") or bet.get("awayOdds") or bet.get("away_odds"))
    return {
        "BetName": name,
        "Map": map_num,
        "SourceBetID": bet_id,
        "HomeName": home_name,
        "SourceHomeID": home_id,
        "HomeOdds": home_odds,
        "AwayName": away_name,
        "SourceAwayID": away_id,
        "AwayOdds": away_odds,
        "Status": status,
    }
