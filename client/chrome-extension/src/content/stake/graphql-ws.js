/** 轻量 graphql-transport-ws 客户端（对齐 A8 ReconnectingWebSocket + `Qe`） */
export class GraphqlTransportWs {
  /**
   * @param {string} path
   * @param {string} protocol
   * @param {{ maxRetries?: number; minReopenDelayMs?: number; maxReopenDelayMs?: number }} [options]
   */
  constructor(path, protocol = "graphql-transport-ws", options = {}) {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    this.url = `${scheme}//${location.host}${path}`;
    this.protocol = protocol;
    this.maxRetries = options.maxRetries ?? Number.POSITIVE_INFINITY;
    this.minReopenDelayMs = options.minReopenDelayMs ?? 1000;
    this.maxReopenDelayMs = options.maxReopenDelayMs ?? 30_000;
    /** @type {WebSocket | null} */
    this.ws = null;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._pingTimer = null;
    this._reconnectTimer = null;
    this._retryCount = 0;
    this._manualClose = false;
    this.connect();
  }

  connect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.ws = new WebSocket(this.url, this.protocol);
    this.ws.onopen = () => {
      this._retryCount = 0;
      this.onopen?.();
    };
    this.ws.onmessage = (ev) => this.onmessage?.(ev);
    this.ws.onclose = (ev) => {
      this.stopPing();
      this.onclose?.(ev);
      this.scheduleReconnect();
    };
    this.ws.onerror = (ev) => this.onerror?.(ev);
  }

  scheduleReconnect() {
    if (this._manualClose || this._retryCount >= this.maxRetries) return;
    const delay = Math.min(
      this.minReopenDelayMs * Math.pow(1.5, this._retryCount),
      this.maxReopenDelayMs,
    );
    this._retryCount += 1;
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(text) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
    }
  }

  startPing(intervalMs = 10_000) {
    this.stopPing();
    this._pingTimer = setInterval(() => {
      this.send(JSON.stringify({ type: "ping" }));
    }, intervalMs);
  }

  stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  close() {
    this._manualClose = true;
    this.stopPing();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.ws?.close();
  }
}
