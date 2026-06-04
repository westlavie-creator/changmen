"use strict";

const mqtt = require("mqtt");
const { login } = require("../platforms/ob/ob_session.js");

const RECONNECT_DELAY_MS = 5_000;
const WATCHDOG_INTERVAL_MS = 30_000;

function defaultSyncObFromSession(session) {
  const { syncObFromSession } = require("../core/esport-api/platform_sync.js");
  return syncObFromSession(session);
}

class ObRelayCore {
  constructor(options = {}, deps = {}) {
    this.options = options;
    this.login = deps.login || login;
    this.syncObFromSession = deps.syncObFromSession || defaultSyncObFromSession;
    this.mqttConnect = deps.mqttConnect || mqtt.connect;
    this.upstream = null;
    this.session = null;
    this.forwardedTopics = new Set();
    this.messageHandlers = new Set();
    this._retryTimer = null;
    this._connecting = false;
    this._watchdogTimer = null;
    this._lastFailedUrl = null;
    this.stats = {
      platform: "OB",
      upstreamConnected: false,
      messagesReceived: 0,
      messagesPublished: 0,
      lastError: null,
      lastUpstreamAt: null,
    };
  }

  onMessage(fn) {
    this.messageHandlers.add(fn);
    return () => this.messageHandlers.delete(fn);
  }

  start() {
    this.reconnectNow();
    this._startWatchdog();
  }

  stop() {
    this._stopWatchdog();
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    if (this.upstream) {
      this.upstream.removeAllListeners();
      this.upstream.on('error', () => {});
      this.upstream.end(true);
      this.upstream = null;
    }
    this.stats.upstreamConnected = false;
  }

  reconnectNow() {
    if (this._connecting || this.upstream?.connected) return;
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    this._doConnect();
  }

  subscribeTopic(topic) {
    this.forwardedTopics.add(topic);
    if (this.upstream?.connected) {
      this.upstream.subscribe(topic, (err) => {
        if (err) this.stats.lastError = err.message;
      });
    }
  }

  unsubscribeTopic(topic) {
    this.forwardedTopics.delete(topic);
    if (this.upstream?.connected) this.upstream.unsubscribe(topic);
  }

  publish(topic, payload) {
    if (!this.upstream?.connected) return false;
    this.upstream.publish(topic, payload);
    this.stats.messagesPublished += 1;
    return true;
  }

  getStatus() {
    this.stats.upstreamConnected = Boolean(this.upstream?.connected);
    return { ...this.stats, forwardedTopics: this.forwardedTopics.size };
  }

  _scheduleReconnect() {
    if (this._retryTimer || this._connecting || this.upstream?.connected) return;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this._doConnect();
    }, RECONNECT_DELAY_MS);
  }

  _doConnect() {
    if (this._connecting || this.upstream?.connected) return;
    this._connecting = true;
    this._connectUpstream()
      .then(() => {
        this._connecting = false;
      })
      .catch((err) => {
        this._connecting = false;
        this.stats.lastError = err.message;
        console.warn("[OB MQTT relay] connect failed, retry in", RECONNECT_DELAY_MS, "ms -", err.message);
        this._scheduleReconnect();
      });
  }

  _startWatchdog() {
    if (this._watchdogTimer) return;
    this._watchdogTimer = setInterval(() => {
      if (!this.upstream?.connected && !this._connecting && !this._retryTimer) {
        console.log("[OB MQTT relay] watchdog: upstream not connected, reconnecting...");
        this.reconnectNow();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  _stopWatchdog() {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  async _connectUpstream() {
    let session;
    try {
      session = await this.login(this.options.loginUrl);
    } catch (err) {
      this.stats.lastError = `OB login: ${err.message}`;
      throw err;
    }
    this.session = session;
    this.syncObFromSession(session);

    const endpoints = session.mqttEndpoints?.length
      ? [...session.mqttEndpoints]
      : session.mqtt ? [session.mqtt] : [];
    if (!endpoints.length) {
      const msg = "OB session has no mqtt endpoint";
      this.stats.lastError = msg;
      throw new Error(msg);
    }
    if (this._lastFailedUrl && endpoints[0] === this._lastFailedUrl && endpoints.length > 1) {
      endpoints.push(endpoints.shift());
    }
    const url = endpoints[0];

    if (this.upstream) {
      this.upstream.removeAllListeners();
      // 防止孤儿 client 的 connectTimeout 计时器到期后 emit error 成为 uncaught exception
      this.upstream.on('error', () => {});
      this.upstream.end(true);
      this.upstream = null;
    }

    const client = this.mqttConnect(url, {
      clientId: `mqttjs_ob_proxy_${Date.now()}`,
      username: session.token,
      protocolId: "MQTT",
      protocolVersion: 4,
      reconnectPeriod: 0,
      keepalive: 30,
      connectTimeout: 15_000,
    });

    client.on("connect", () => {
      this.stats.upstreamConnected = true;
      this.stats.lastError = null;
      this._lastFailedUrl = null;
      console.log("[OB MQTT relay] upstream connected", url);
      for (const topic of this.forwardedTopics) {
        client.subscribe(topic, (err) => {
          if (err) this.stats.lastError = err.message;
        });
      }
    });

    client.on("message", (topic, payload) => {
      this.stats.messagesReceived += 1;
      this.stats.lastUpstreamAt = Date.now();
      for (const fn of this.messageHandlers) {
        try {
          fn(topic, payload);
        } catch (err) {
          this.stats.lastError = err.message;
        }
      }
    });

    client.on("error", (err) => {
      this.stats.lastError = err.message;
      this.stats.upstreamConnected = false;
      this._lastFailedUrl = url;
      console.warn("[OB MQTT relay] upstream error:", err.message, url);
    });

    client.on("close", () => {
      this.stats.upstreamConnected = false;
      console.log("[OB MQTT relay] upstream closed, reconnecting immediately...", url);
      this._scheduleReconnect();
    });

    this.upstream = client;
  }
}

module.exports = { ObRelayCore, RECONNECT_DELAY_MS, WATCHDOG_INTERVAL_MS };
