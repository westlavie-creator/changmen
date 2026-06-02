import os
import time

A8_MATCH_MAX_FUTURE_SEC = 3600
A8_MATCH_LIST_MAX_FUTURE_SEC = A8_MATCH_MAX_FUTURE_SEC
A8_MATCH_MAX_PAST_SEC = 12 * 3600
A8_MATCH_MAX_FUTURE_MS = A8_MATCH_MAX_FUTURE_SEC * 1000
A8_MATCH_LIST_MAX_FUTURE_MS = A8_MATCH_LIST_MAX_FUTURE_SEC * 1000
A8_MATCH_MAX_PAST_MS = A8_MATCH_MAX_PAST_SEC * 1000
IM_ODDS_ACTIVE_MS = 3 * 60 * 60 * 1000


def normalize_epoch_ms(raw) -> int:
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return 0
    if n <= 0:
        return 0
    if n < 1e12:
        return int(n * 1000)
    return int(n)


def now_ms() -> int:
    return int(time.time() * 1000)


def a8_start_time_list_allowed(start_ms) -> bool:
    ms = normalize_epoch_ms(start_ms)
    if not ms:
        return True
    now = now_ms()
    return (now - A8_MATCH_MAX_PAST_MS) <= ms <= (now + A8_MATCH_LIST_MAX_FUTURE_MS)
