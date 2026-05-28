"use strict";

const aedes = require("aedes")();
const mqtt = require("mqtt");
const { WebSocketServer, createWebSocketStream } = require("ws");
const { login } = require("../platforms/ob/ob_session.js");
const { syncObFromSession } = require("../esport-api/platform_sync.js");

const WS_PATH = "/esport/ws/OB";

/** 下游 UI 连接 OB relay 时使用的 MQTT 凭据（与参考 bundle 一致，仅用于本地认证） */
const OB_DOWNSTREAM_MQTT_USER = process.env.OB_PROXY_MQTT_USER || "admin";
const OB_DOWNSTREAM_MQTT_PASS = process.env.OB_PROXY_MQTT_PASS || "Qazqaz123...";

class ObMqttRelay {
  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.upstream = null;
    this.session = null;
    this.clients = 0;
    this.stats = {
      platform: "OB",
      path: WS_PATH,
      upstreamConnected: false,
      downstreamClients: 0,
      messagesRelayed: 0,
      lastError: null,
      lastUpstreamAt: null,
    };
    this._refreshTimer = null;
    this._setupAedes();
    this._setupWss();
  }

  paths() {
    return [WS_PATH, `${WS_PATH}/`];
  }

  handleUpgrade(request, socket, head) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  _setupAedes() {
    aedes.authenticate = (client, username, password, callback) => {
      const ok =
        String(username) === OB_DOWNSTREAM_MQTT_USER &&
        String(password) === OB_DOWNSTREAM_MQTT_PASS;
      callback(null, ok || process.env.OB_PROXY_ALLOW_ANY === "1");
    };

    aedes.on("subscribe", (subscriptions, _client) => {
      if (this.upstream?.connected) {
        for (const sub of subscriptions) {
          this.upstream.subscribe(sub.topic, (err) => {
            if (err) this.stats.lastError = err.message;
          });
        }
      }
    });

    aedes.on("publish", (packet, client) => {
      if (!client || !this.upstream?.connected) return;
      this.upstream.publish(packet.topic, packet.payload);
    });
  }

  _setupWss() {
    this.wss.on("connection", (ws) => {
      this.clients += 1;
      this.stats.downstreamClients = this.clients;
      const stream = createWebSocketStream(ws);
      aedes.handle(stream);
      stream.on("close", () => {
        this.clients = Math.max(0, this.clients - 1);
        this.stats.downstreamClients = this.clients;
      });
    });
  }

  async start() {
    await this._connectUpstream();
    this._refreshTimer = setInterval(() => {
      this._connectUpstream().catch((err) => {
        this.stats.lastError = err.message;
      });
    }, 5 * 60 * 1000);
  }

  async stop() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    if (this.upstream) {
      this.upstream.end(true);
      this.upstream = null;
    }
    this.stats.upstreamConnected = false;
    for (const client of this.wss.clients) client.close();
  }

  getStatus() {
    return { ...this.stats };
  }

  async _connectUpstream() {
    const session = await login();
    this.session = session;
    syncObFromSession(session);
    const url = session.mqtt || session.mqttEndpoints?.[0];
    if (!url) throw new Error("OB session has no mqtt endpoint");

    if (this.upstream) {
      this.upstream.removeAllListeners();
      this.upstream.end(true);
      this.upstream = null;
    }

    const client = mqtt.connect(url, {
      clientId: `mqttjs_ob_proxy_${Date.now()}`,
      username: session.token,
      protocolId: "MQTT",
      protocolVersion: 4,
      reconnectPeriod: 5000,
      keepalive: 60,
    });

    client.on("connect", () => {
      this.stats.upstreamConnected = true;
      this.stats.lastError = null;
    });

    client.on("message", (topic, payload) => {
      this.stats.messagesRelayed += 1;
      this.stats.lastUpstreamAt = Date.now();
      aedes.publish({
        topic,
        payload,
        qos: 0,
        retain: false,
      });
    });

    client.on("error", (err) => {
      this.stats.lastError = err.message;
    });

    client.on("close", () => {
      this.stats.upstreamConnected = false;
    });

    this.upstream = client;
  }
}

module.exports = { ObMqttRelay, WS_PATH };
