/**
 * 多平台 WebSocket 采集客户端（连接本机 /esport/ws/* 代理）。
 * 依赖：页面需先加载 mqtt.min.js 与 socketcluster-client.min.js
 */
(function (global) {
  const OB_MQTT = {
    username: "admin",
    password: "Qazqaz123...",
    clientId: `mqttjs_web_${Date.now()}`,
  };

  class EsportCollect {
    constructor(options = {}) {
      const host = options.host || global.location?.host || "localhost:3456";
      this.host = String(host).replace(/^wss?:\/\//, "").replace(/\/$/, "");
      this.secure = options.secure ?? global.location?.protocol === "https:";
      this.wsProto = this.secure ? "wss" : "ws";
      this.handlers = {};
      this.stats = {
        OB: { connected: false, messages: 0 },
        RAY: { connected: false, messages: 0 },
        TF: { connected: false, messages: 0 },
      };
      this._obClient = null;
      this._raySocket = null;
      this._rayChannel = null;
      this._tfWs = null;
    }

    on(platform, handler) {
      this.handlers[platform] = handler;
    }

    onStatsChange(fn) {
      this._onStatsChange = fn;
    }

    _emitStats() {
      if (this._onStatsChange) this._onStatsChange(this.getStats());
    }

    _dispatch(platform, payload) {
      this.stats[platform].messages += 1;
      const fn = this.handlers[platform];
      if (fn) fn(payload);
    }

    /** OB — MQTT over WS @ /esport/ws/OB */
    connectOB() {
      if (!global.mqtt) throw new Error("mqtt.js not loaded");
      const url = `${this.wsProto}://${this.host}/esport/ws/OB`;
      this._obClient = global.mqtt.connect(url, {
        ...OB_MQTT,
        clean: true,
        keepalive: 60,
        reconnectPeriod: 5000,
        protocolId: "MQTT",
        protocolVersion: 4,
      });
      this._obClient.on("error", (err) => {
        console.error("[OB MQTT]", err.message || err);
      });
      this._obClient.on("connect", () => {
        this.stats.OB.connected = true;
        this._emitStats();
      });
      this._obClient.on("close", () => {
        this.stats.OB.connected = false;
        this._emitStats();
      });
      this._obClient.on("message", (topic, buf) => {
        let payload;
        try {
          payload = JSON.parse(buf.toString());
        } catch {
          payload = buf.toString();
        }
        this._dispatch("OB", { topic, payload });
      });
      return this._obClient;
    }

    subscribeOB(topics) {
      if (!this._obClient) return;
      const list = Array.isArray(topics) ? topics : [topics];
      this._obClient.subscribe(list);
    }

    /** RAY — SocketCluster @ /esport/ws/RAY，频道 match */
    async connectRAY() {
      if (!global.socketClusterClient?.create) {
        const mod = await import("/vendor/socketcluster-client.min.js");
        global.socketClusterClient = { create: mod.create, version: mod.version };
      }
      const sc = global.socketClusterClient;
      this._raySocket = sc.create({
        hostname: this.host.split(":")[0],
        port: this.host.includes(":") ? Number(this.host.split(":")[1]) : this.secure ? 443 : 80,
        secure: this.secure,
        protocolVersion: 1,
        path: "/esport/ws/RAY",
        autoConnect: true,
        ackTimeout: 10000,
      });
      this._watchRayLifecycle();

      try {
        if (this._raySocket.state !== "open") {
          await this._raySocket.listener("connect").once();
        }
        this._rayChannel = this._raySocket.subscribe("match");
        await this._rayChannel.listener("subscribe").once();
        this.stats.RAY.connected = this._raySocket.state === "open";
        this._emitStats();
        (async () => {
          for await (const msg of this._rayChannel) {
            this._dispatch("RAY", msg);
          }
        })().catch(() => {
          this.stats.RAY.connected = false;
          this._emitStats();
        });
      } catch (err) {
        console.error("[RAY SC]", err.message || err);
        this.stats.RAY.connected = false;
        this._emitStats();
        throw err;
      }
      return this._raySocket;
    }

    _watchRayLifecycle() {
      const socket = this._raySocket;
      if (!socket) return;

      (async () => {
        for await (const _ of socket.listener("connect")) {
          this.stats.RAY.connected = socket.state === "open";
          this._emitStats();
        }
      })().catch(() => {});

      (async () => {
        for await (const _ of socket.listener("disconnect")) {
          this.stats.RAY.connected = false;
          this._emitStats();
        }
      })().catch(() => {});

      (async () => {
        for await (const { error } of socket.listener("error")) {
          console.error("[RAY SC]", error?.message || error);
          this.stats.RAY.connected = false;
          this._emitStats();
        }
      })().catch(() => {});
    }

    /** TF — 原生 WebSocket 隧道 @ /esport/ws/TF */
    connectTF(authToken, combo = false) {
      const q = new URLSearchParams({
        auth_token: authToken || "",
        combo: combo ? "true" : "false",
      });
      const url = `${this.wsProto}://${this.host}/esport/ws/TF?${q}`;
      this._tfWs = new WebSocket(url);
      this._tfWs.onopen = () => {
        this.stats.TF.connected = true;
      };
      this._tfWs.onclose = () => {
        this.stats.TF.connected = false;
      };
      this._tfWs.onmessage = (ev) => {
        let payload;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          payload = ev.data;
        }
        this._dispatch("TF", payload);
      };
      return this._tfWs;
    }

    connectAll(options = {}) {
      const tasks = [];
      if (options.ob !== false) {
        this.connectOB();
      }
      if (options.ray !== false) {
        tasks.push(this.connectRAY());
      }
      if (options.tf && options.tfToken) {
        this.connectTF(options.tfToken, options.tfCombo);
      }
      return Promise.all(tasks);
    }

    getStats() {
      return JSON.parse(JSON.stringify(this.stats));
    }

    disconnect() {
      if (this._obClient) this._obClient.end(true);
      if (this._rayChannel) this._rayChannel.unsubscribe();
      if (this._raySocket) this._raySocket.disconnect();
      if (this._tfWs) this._tfWs.close();
    }
  }

  global.EsportCollect = EsportCollect;
})(typeof window !== "undefined" ? window : globalThis);
