"use strict";

const { ObMqttRelay } = require("./ob_mqtt_relay.js");
const { RayScRelay } = require("./ray_sc_relay.js");
const { TfWsRelay } = require("./tf_ws_relay.js");
const { IaWsRelay } = require("./ia_ws_relay.js");

function normalizePath(url) {
  try {
    const p = new URL(url, "http://127.0.0.1").pathname;
    return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
  } catch {
    return url.split("?")[0];
  }
}

/**
 * 本机 per-platform WebSocket 聚合层（upstream 直连各平台源站）。
 *
 * 路由：
 *   /esport/ws/OB   — MQTT over WebSocket（aedes 桥接 OB 源站 MQTT）
 *   /esport/ws/RAY  — SocketCluster（频道 match，转发 cfsocket 源站）
 *   /esport/ws/TF   — 透明 WS 隧道（需 TF_GATEWAY + TF_TOKEN 或 query auth_token）
 *   /esport/ws/IA   — 透明 Socket.IO 隧道（注入 Origin/token header 后转发上游）
 */
class EsportProxy {
  constructor(options = {}) {
    this.relays = [];
    this.pathMap = new Map();
    this.started = false;
    this.httpServer = null;

    if (options.ob !== false) {
      this.obRelay = new ObMqttRelay();
      this._register(this.obRelay);
    }
    if (options.ray !== false) {
      this.rayRelay = new RayScRelay(options.rayOptions || {});
      this._register(this.rayRelay);
    }
    if (options.tf !== false) {
      this.tfRelay = new TfWsRelay(options.tfOptions || {});
      this._register(this.tfRelay);
    }
    if (options.ia !== false) {
      this.iaRelay = new IaWsRelay(options.iaOptions || {});
      this._register(this.iaRelay);
    }
  }

  _register(relay) {
    this.relays.push(relay);
    for (const p of relay.paths()) {
      this.pathMap.set(p, relay);
    }
  }

  attach(httpServer) {
    this.httpServer = httpServer;
    if (this.rayRelay?.attach) {
      this.rayRelay.attach(httpServer);
    }

    // 必须在所有 ws.Server({ server }) 之前处理，且 RAY/OB 均用 noServer + 统一路由
    httpServer.prependListener("upgrade", (request, socket, head) => {
      const path = normalizePath(request.url);
      const relay = this.pathMap.get(path);
      if (!relay?.handleUpgrade) return;
      relay.handleUpgrade(request, socket, head);
    });
  }

  async start() {
    if (this.started) return;
    this.started = true;
    await Promise.all(this.relays.map((r) => r.start()));
  }

  async stop() {
    this.started = false;
    await Promise.all(this.relays.map((r) => r.stop()));
  }

  getStatus() {
    return {
      role: "esport-ws-proxy",
      note: "Local esport WS aggregator; upstream connects to platform sources only",
      platforms: this.relays.map((r) => r.getStatus()),
    };
  }
}

function attachEsportProxy(httpServer, options = {}) {
  const proxy = new EsportProxy(options);
  proxy.attach(httpServer);
  return proxy;
}

module.exports = { EsportProxy, attachEsportProxy };
