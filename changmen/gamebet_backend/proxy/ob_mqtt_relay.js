"use strict";

const aedes = require("aedes")();
const { WebSocketServer, createWebSocketStream } = require("ws");
const { ObRelayCore } = require("../relays/ob_relay_core.js");

const WS_PATH = "/esport/ws/OB";

const OB_DOWNSTREAM_MQTT_USER = process.env.OB_PROXY_MQTT_USER || "admin";
const OB_DOWNSTREAM_MQTT_PASS = process.env.OB_PROXY_MQTT_PASS || "Qazqaz123...";

class ObMqttRelay {
  constructor(options = {}) {
    this.wss = new WebSocketServer({ noServer: true });
    this.core = options.core || new ObRelayCore(options);
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
    this._setupAedes();
    this._setupWss();
    this.core.onMessage((topic, payload) => {
      this.stats.messagesRelayed += 1;
      this.stats.lastUpstreamAt = Date.now();
      aedes.publish({ topic, payload, qos: 0, retain: false });
    });
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
      const user = String(username ?? "");
      const pass =
        password == null ? "" :
        Buffer.isBuffer(password) ? password.toString("utf8") : String(password);
      const ok = user === OB_DOWNSTREAM_MQTT_USER && pass === OB_DOWNSTREAM_MQTT_PASS;
      if (!ok && process.env.OB_PROXY_ALLOW_ANY !== "1") {
        console.warn("[OB MQTT relay] auth rejected for client", client?.id, "user=", user);
      }
      callback(null, ok || process.env.OB_PROXY_ALLOW_ANY === "1");
    };

    aedes.on("subscribe", (subscriptions, _client) => {
      for (const sub of subscriptions) {
        this.core.subscribeTopic(sub.topic);
      }
    });

    aedes.on("unsubscribe", (unsubscriptions, _client) => {
      for (const topic of unsubscriptions) {
        this.core.unsubscribeTopic(topic);
      }
    });

    aedes.on("publish", (packet, client) => {
      if (!client) return;
      this.core.publish(packet.topic, packet.payload);
    });
  }

  _setupWss() {
    this.wss.on("connection", (ws) => {
      this.clients += 1;
      this.stats.downstreamClients = this.clients;
      console.log("[OB MQTT relay] downstream ws open, clients=", this.clients);
      if (!this.core.getStatus().upstreamConnected) this.core.reconnectNow();
      const stream = createWebSocketStream(ws);
      aedes.handle(stream);
      stream.on("error", (err) => {
        console.warn("[OB MQTT relay] downstream stream error:", err.message);
      });
      stream.on("close", () => {
        this.clients = Math.max(0, this.clients - 1);
        this.stats.downstreamClients = this.clients;
      });
    });
  }

  start() {
    this.core.start();
  }

  stop() {
    this.core.stop();
    this.stats.upstreamConnected = false;
    for (const client of this.wss.clients) client.close();
  }

  getStatus() {
    const coreStatus = this.core.getStatus();
    this.stats.upstreamConnected = coreStatus.upstreamConnected;
    this.stats.lastError = this.stats.lastError || coreStatus.lastError;
    this.stats.lastUpstreamAt = this.stats.lastUpstreamAt || coreStatus.lastUpstreamAt;
    return { ...this.stats };
  }
}

module.exports = { ObMqttRelay, WS_PATH };
