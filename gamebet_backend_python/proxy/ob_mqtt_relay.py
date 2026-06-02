"""
OB MQTT 中继：
  - 用 aiomqtt 连接上游 OB MQTT 服务器（MQTT 3.1.1）
  - 收到消息后通过 WebSocket 直接推送给浏览器客户端
  - 浏览器用普通 WebSocket 连接 /esport/ws/OB，接收 JSON {topic, payload}
"""
import asyncio
import json
import os
import time
from fastapi import WebSocket, WebSocketDisconnect

RECONNECT_DELAY = int(os.environ.get("OB_MQTT_RECONNECT_DELAY", "5"))
WATCHDOG_INTERVAL = int(os.environ.get("OB_MQTT_WATCHDOG_INTERVAL", "30"))

_clients: set[WebSocket] = set()
_stats = {
    "platform": "OB",
    "upstreamConnected": False,
    "downstreamClients": 0,
    "messagesRelayed": 0,
    "lastError": None,
    "lastUpstreamAt": None,
}


async def _get_ob_session():
    """从 Node 侧的 ob_session 读取已保存的平台凭据"""
    from esport_api import store
    platform = store.get_platform("OB")
    if not platform:
        raise RuntimeError("OB 平台未配置，请先通过 API_UpdatePlatform 设置凭据")
    mqtt_url = platform.get("mqttUrl") or platform.get("mqtt")
    token = platform.get("token") or platform.get("mqttToken")
    if not mqtt_url or not token:
        raise RuntimeError("OB 平台缺少 mqttUrl / token，请检查平台配置")
    return {"mqttUrl": mqtt_url, "token": token}


async def _broadcast(topic: str, payload: bytes):
    if not _clients:
        return
    msg = json.dumps({"topic": topic, "payload": payload.decode("utf-8", errors="replace")},
                     ensure_ascii=False)
    dead = set()
    for ws in list(_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    _clients.difference_update(dead)


async def _connect_loop():
    import aiomqtt
    while True:
        try:
            session = await _get_ob_session()
            url = session["mqttUrl"]
            # 解析 host/port/tls
            if url.startswith("wss://") or url.startswith("ws://"):
                # MQTT over WebSocket：aiomqtt 2.x 通过 websockets transport 支持
                host = url.split("//")[1].split("/")[0].split(":")[0]
                port_str = url.split("//")[1].split("/")[0].split(":")[1] if ":" in url.split("//")[1].split("/")[0] else ("443" if url.startswith("wss") else "80")
                port = int(port_str)
                tls = url.startswith("wss://")
            elif url.startswith("mqtts://"):
                host = url[8:].split(":")[0]
                port = int(url[8:].split(":")[1]) if ":" in url[8:] else 8883
                tls = True
            else:
                host = url.split("://")[-1].split(":")[0]
                port = int(url.split("://")[-1].split(":")[1]) if ":" in url.split("://")[-1] else 1883
                tls = False

            async with aiomqtt.Client(
                hostname=host,
                port=port,
                username=session["token"],
                protocol=aiomqtt.ProtocolVersion.V311,
                keepalive=30,
                tls_context=__import__("ssl").create_default_context() if tls else None,
            ) as client:
                _stats["upstreamConnected"] = True
                _stats["lastError"] = None
                print(f"[OB MQTT relay] upstream connected: {host}:{port}")

                await client.subscribe("#")
                async for message in client.messages:
                    _stats["messagesRelayed"] += 1
                    _stats["lastUpstreamAt"] = int(time.time() * 1000)
                    await _broadcast(str(message.topic), message.payload)

        except Exception as e:
            _stats["upstreamConnected"] = False
            _stats["lastError"] = str(e)
            print(f"[OB MQTT relay] error: {e}, retry in {RECONNECT_DELAY}s")
            await asyncio.sleep(RECONNECT_DELAY)


async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    _clients.add(websocket)
    _stats["downstreamClients"] = len(_clients)
    print(f"[OB MQTT relay] browser connected, clients={len(_clients)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _clients.discard(websocket)
        _stats["downstreamClients"] = len(_clients)


def get_status() -> dict:
    return dict(_stats)


async def start():
    asyncio.create_task(_connect_loop())
