import asyncio
import json
from typing import Callable
from fastapi import WebSocket, WebSocketDisconnect

_clients: set[WebSocket] = set()
_snapshot_fn: Callable | None = None
_listeners: list[Callable] = []


def set_snapshot_fn(fn: Callable):
    global _snapshot_fn
    _snapshot_fn = fn


def add_hub_listener(fn: Callable):
    _listeners.append(fn)


async def broadcast(event: dict):
    if not _clients:
        return
    text = json.dumps(event, ensure_ascii=False)
    dead = set()
    for ws in list(_clients):
        try:
            await ws.send_text(text)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)
    try:
        if _snapshot_fn:
            snapshot = _snapshot_fn()
            await websocket.send_text(json.dumps({"type": "snapshot", "data": snapshot}, ensure_ascii=False))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _clients.discard(websocket)
