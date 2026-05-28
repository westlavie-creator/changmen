"use strict";

const { getCatalogSummary } = require("../../shared/game_catalog.js");
const {
  tryLoadSession,
  fetchBalance,
  ensureOddsTypeEurope,
  persistPlatform,
} = require("./hg_session.js");
const { syncHgFromSession } = require("../../esport-api/platform_sync.js");

class HgFeed {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs || Number(process.env.HG_POLL_MS || 30000);
    this.listeners = new Set();
    this.session = null;
    this.matches = [];
    this.byMatch = {};
    this.status = {
      running: false,
      error: null,
      lastSync: null,
      matchCount: 0,
      gateway: null,
      mode: "account_adapter",
      note: "皇冠无标准电竞实时赔率流；本 Feed 提供账户余额轮询与订单适配占位",
      balance: null,
      currency: null,
      username: null,
    };
    this._timer = null;
    this._oddsTypeSet = false;
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
      status: { ...this.status, aggregateGames: getCatalogSummary() },
      matches: [],
      updatedAt: Date.now(),
    };
  }

  async sync() {
    const session = tryLoadSession();
    if (!session) {
      this.status.error = "缺少 HG 凭证（HG_GATEWAY + HG_TOKEN JSON 或 platforms.json）";
      this.emit({ type: "snapshot", data: this.getSnapshot() });
      return;
    }
    this.session = session;
    this.status.gateway = session.gateway;
    syncHgFromSession(session);

    if (!this._oddsTypeSet) {
      await ensureOddsTypeEurope(session).catch(() => false);
      this._oddsTypeSet = true;
    }

    const account = await fetchBalance(session);
    this.status.balance = account.balance;
    this.status.currency = account.currency;
    this.status.username = account.username;
    this.status.lastSync = Date.now();
    this.status.error = null;
    persistPlatform(session, account);
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  async start() {
    if (this.status.running) return;
    this.status.running = true;
    await this.sync().catch((err) => this.setError(err));
    this._timer = setInterval(() => {
      this.sync().catch((err) => this.setError(err));
    }, this.pollIntervalMs);
  }

  stop() {
    this.status.running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

module.exports = { HgFeed };
