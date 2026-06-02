import os
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from esport_api.router import try_esport_api
from server.snapshot_ws import websocket_endpoint as snapshot_ws, set_snapshot_fn, broadcast
from proxy.ob_mqtt_relay import websocket_endpoint as ob_ws, start as ob_mqtt_start

PORT = int(os.environ.get("PORT", "3456"))

BACKEND_ROOT = Path(__file__).parent
CHANGMEN_ROOT = BACKEND_ROOT.parent
APP_DIR = CHANGMEN_ROOT / "gamebet_frontend" / "app" / "dist"
CONSOLE_DIR = CHANGMEN_ROOT / "gamebet_frontend" / "console"
PUBLIC_DIR = BACKEND_ROOT / "public"

ENABLE_OB_MQTT_RELAY = os.environ.get("ENABLE_OB_MQTT_RELAY", "1") != "0"


def _get_snapshot():
    from shared.game_catalog import get_catalog_summary
    from esport_api import store
    try:
        match_list = store.build_match_list()
    except Exception:
        match_list = []
    return {
        "status": {"running": True, "matchCount": len(match_list)},
        "aggregateGames": get_catalog_summary(),
        "platforms": {},
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    from esport_api import store
    from account import account_store

    set_snapshot_fn(_get_snapshot)

    try:
        store.ensure_seed()
        info = store.rebuild_client_match_list_now()
        print(f"[store] client_matchs ready ({len(info)} rows)")
    except Exception as e:
        print(f"[store] init failed: {e}")

    account_store.ensure_seed()

    if ENABLE_OB_MQTT_RELAY:
        await ob_mqtt_start()
        print("[OB MQTT relay] started")

    print(f"App: http://localhost:{PORT}/app/  |  API: http://localhost:{PORT}/esport/")
    yield


app = FastAPI(lifespan=lifespan)


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_snapshot(websocket: WebSocket):
    await snapshot_ws(websocket)


@app.websocket("/esport/ws/OB")
async def ws_ob(websocket: WebSocket):
    await ob_ws(websocket)


# ── esport API ────────────────────────────────────────────────────────────────

@app.api_route("/esport/{path:path}", methods=["GET", "POST"])
async def esport_api(request: Request):
    result = await try_esport_api(request)
    if result is not None:
        return result
    return JSONResponse({"success": 0, "msg": "not found"}, status_code=404)


@app.api_route("/IP", methods=["GET", "POST"])
@app.api_route("/IP/Address", methods=["GET", "POST"])
async def ip_api(request: Request):
    result = await try_esport_api(request)
    if result is not None:
        return result
    return JSONResponse({"success": 0, "msg": "not found"}, status_code=404)


# ── 静态文件 ──────────────────────────────────────────────────────────────────

if APP_DIR.exists():
    app.mount("/app", StaticFiles(directory=str(APP_DIR), html=True), name="app")

if CONSOLE_DIR.exists():
    app.mount("/console", StaticFiles(directory=str(CONSOLE_DIR), html=True), name="console")

if PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(PUBLIC_DIR), html=True), name="public")


@app.get("/")
async def root():
    return JSONResponse({"status": "ok", "app": "/app/", "api": "/esport/"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
