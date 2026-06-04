"use strict";

const { parseEuroOddsPayload } = require("./pb_core.js");
const { describePlatformGame, getActivePlatformGameIds, getCatalogSummary } = require("../../core/shared/game_catalog.js");
const { attachPbMatchBetRefs } = require("../../core/shared/bet_ref.js");
const { loadSession, tryLoadSession, fetchEuroOdds, fetchBalance, persistPlatform } = require("./pb_session.js");
const { syncPbFromSession } = require("../../core/esport-api/platform_sync.js");

class PbFeed {
  constructor(options = {}) {
    this.syncIntervalMs = options.syncIntervalMs || Number(process.env.PB_SYNC_MS || 5000);
    this.allowedSlugs = new Set(
      (options.allowedSlugs || options.gameSlugs || getActivePlatformGameIds("PB")).map(String)
    );
    this.listeners = new Set();
    this.session = null;
    this.matches = [];
    this.byMatch = {};
    this.lineIds = new Map();
    this.status = {
      running: false,
      syncing: false,
      error: null,
      lastSync: null,
      matchCount: 0,
      gateway: null,
      balance: null,
      currency: null,
    };
    this._syncing = false;
    this._timers = [];
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
      matches: this.matches.map((m) => {
        const game = describePlatformGame("PB", m.gameId);
        return {
          matchId: m.matchId,
          gameId: m.gameId,
          gameName: game.inCatalog ? game.gameName : m.gameName || m.gameId,
          gameCode: game.inCatalog ? game.gameCode : m.gameCode,
          bo: m.bo,
          startTime: m.startTime,
          isLive: m.isLive,
          home: m.home.name,
          away: m.away.name,
          league: m.leagueName,
          ...(this.byMatch[m.matchId] || {}),
        };
      }),
      updatedAt: Date.now(),
    };
  }

  async start() {
    if (this.status.running) return;
    this.status.running = true;
    this._timers.push(
      setInterval(() => {
        this.sync().catch((err) => this.setError(err));
      }, this.syncIntervalMs)
    );
    await this.sync();
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
    for (const timer of this._timers) clearInterval(timer);
    this._timers = [];
  }

  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    this.status.syncing = true;
    this.emit({ type: "snapshot", data: this.getSnapshot() });

    try {
      const session = tryLoadSession();
      if (!session) {
        this.status.error = "缺少 PB 凭证（PB_GATEWAY + PB_TOKEN 或 platforms.json）";
        this.emit({ type: "snapshot", data: this.getSnapshot() });
        return;
      }
      this.session = session;
      this.status.gateway = this.session.gateway;
      persistPlatform(this.session);
      syncPbFromSession(this.session);

      try {
        const bal = await fetchBalance(this.session);
        this.status.balance = bal.balance;
        this.status.currency = bal.currency;
      } catch (err) {
        console.warn("[pb-feed] balance skip:", err.message);
      }

      const payload = await fetchEuroOdds(this.session);
      const parsed = parseEuroOddsPayload(payload, {
        allowedSlugs: this.allowedSlugs,
      });

      this.matches = parsed.matches;
      this.byMatch = {};
      for (const m of parsed.matches) {
        const detail = parsed.byMatch[m.matchId];
        if (!detail) continue;
        const gameCode = describePlatformGame("PB", m.gameId).gameCode;
        this.byMatch[m.matchId] = attachPbMatchBetRefs({ ...detail }, m.matchId, gameCode);
      }
      this.lineIds = parsed.lineIds;
      this.status.matchCount = this.matches.length;
      this.status.lastSync = Date.now();
      this.status.error = null;
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    } catch (err) {
      this.setError(err);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
      throw err;
    } finally {
      this.status.syncing = false;
      this._syncing = false;
    }
  }
}

module.exports = { PbFeed };
