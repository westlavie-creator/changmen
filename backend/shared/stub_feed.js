"use strict";

/** 占位 Feed：平台尚未接入时使用 */
class StubFeed {
  constructor(options = {}) {
    this.platformId = options.platformId || "UNKNOWN";
    this.listeners = new Set();
    this.status = {
      running: false,
      mqtt: false,
      ws: false,
      syncing: false,
      error: null,
      lastSync: null,
      matchCount: 0,
      collectionMode: options.collectionMode || "pending",
      collectionDesc: options.collectionDesc || "",
      implementation: options.implementation || "pending",
      note: "待接入（A8 模式占位）",
    };
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  setError(error) {
    this.status.error = error?.message || String(error);
    this.emit({ type: "status", status: { ...this.status } });
  }

  getSnapshot() {
    return {
      status: { ...this.status },
      matches: [],
      updatedAt: Date.now(),
    };
  }

  async start() {
    this.status.running = true;
    this.status.error = null;
    this.emit({ type: "status", status: { ...this.status } });
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
  }
}

module.exports = { StubFeed };
