"use strict";

const { getCatalogSummary } = require("./game_catalog.js");
const { getCatalogSummary: getMarketCatalogSummary } = require("./market_catalog.js");

/**
 * 聚合多个平台 Feed，统一 snapshot / WebSocket 事件。
 * 每个平台 Feed 需实现：start(), stop(), on(fn), getSnapshot()
 */
class FeedHub {
  constructor(platforms) {
    /** @type {{ id: string, label: string, instance: object|null, Feed: Function, options?: object, enabled: boolean }[]} */
    this.platforms = platforms.map((p) => ({
      id: p.id,
      label: p.label || p.id,
      Feed: p.Feed,
      options: p.options || {},
      enabled: p.enabled !== false,
      instance: null,
    }));
    this.listeners = new Set();
    this.status = { running: false, error: null };
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  getSnapshot() {
    const platforms = {};
    let totalMatches = 0;
    for (const p of this.platforms) {
      if (!p.instance) {
        platforms[p.id] = {
          label: p.label,
          enabled: p.enabled,
          status: {
            running: false,
            mqtt: false,
            note: p.enabled ? "未启动" : "未启用",
          },
          matches: [],
          updatedAt: Date.now(),
        };
        continue;
      }
      const snap = p.instance.getSnapshot();
      platforms[p.id] = { label: p.label, enabled: p.enabled, ...snap };
      totalMatches += snap.matches?.length || 0;
    }
    return {
      status: { ...this.status, matchCount: totalMatches },
      aggregateGames: getCatalogSummary(),
      aggregateMarkets: getMarketCatalogSummary(),
      platforms,
      updatedAt: Date.now(),
    };
  }

  async start() {
    this.status.running = true;
    for (const p of this.platforms) {
      if (!p.enabled) continue;
      p.instance = new p.Feed(p.options);
      p.instance.on((event) => {
        if (event.type === "snapshot") {
          // 各平台 Feed 返回的是单平台 snapshot，统一聚合后再推送
          this.emit({ type: "snapshot", data: this.getSnapshot() });
          return;
        }
        this.emit({ ...event, platform: p.id });
      });
      this.emit({ type: "snapshot", data: this.getSnapshot() });
      try {
        await p.instance.start();
      } catch (err) {
        this.status.error = err.message;
        if (typeof p.instance.setError === "function") {
          p.instance.setError(err);
        }
        this.emit({ type: "snapshot", data: this.getSnapshot() });
      }
    }
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
    for (const p of this.platforms) {
      if (p.instance && typeof p.instance.stop === "function") {
        p.instance.stop();
      }
      p.instance = null;
    }
  }
}

module.exports = { FeedHub };
