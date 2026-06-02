def format_odds(value) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not (n == n) or n == 0:  # isnan check
        return 0.0
    return round(n * 1000) / 1000


def format_bet_odds(bet: dict) -> dict:
    if not bet or not isinstance(bet, dict):
        return bet
    return {
        **bet,
        "HomeOdds": format_odds(bet.get("HomeOdds")),
        "AwayOdds": format_odds(bet.get("AwayOdds")),
    }
