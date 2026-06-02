import json
import os
from pathlib import Path

_CATALOG_PATH = Path(__file__).parent.parent.parent / "gamebet_backend" / "shared" / "game_catalog.json"

# 如果 Node 侧的 catalog 不可访问，退而求其次用本地副本
_LOCAL_CATALOG_PATH = Path(__file__).parent / "game_catalog.json"

def _load_catalog():
    for p in [_CATALOG_PATH, _LOCAL_CATALOG_PATH]:
        if p.exists():
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    return {"games": []}

_catalog = _load_catalog()


def list_games() -> list:
    return list(_catalog.get("games", []))


def get_game_by_code(code: str) -> dict | None:
    for g in _catalog.get("games", []):
        if g.get("code") == code:
            return g
    return None


def get_game_code_for_platform_id(provider: str, native_id: str) -> str:
    if not native_id:
        return ""
    for g in _catalog.get("games", []):
        pid = g.get("platforms", {}).get(provider)
        if pid and str(pid) == str(native_id):
            return g.get("code", "")
    return ""


def get_platform_game_id(provider: str, game_code: str) -> str:
    g = get_game_by_code(game_code)
    if not g:
        return ""
    return str(g.get("platforms", {}).get(provider) or "")


def resolve_client_game(provider: str, source_game_id: str) -> dict:
    code = get_game_code_for_platform_id(provider, str(source_game_id or ""))
    game = get_game_by_code(code) if code else None
    if game:
        return {"Game": game.get("name", ""), "GameID": str(game.get("a8GameId", "") or "")}
    return {"Game": "", "GameID": ""}


def describe_platform_game(provider: str, source_game_id: str) -> dict:
    code = get_game_code_for_platform_id(provider, str(source_game_id or ""))
    return {"gameCode": code}


def get_catalog_summary() -> list:
    return [{"code": g["code"], "name": g.get("name", "")} for g in _catalog.get("games", [])]
