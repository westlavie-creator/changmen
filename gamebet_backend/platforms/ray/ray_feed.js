"use strict";

const Core = require("./ray_core.js");
const { describePlatformGame, getCatalogSummary } = require("../../shared/game_catalog.js");
const { getGameName, getGameCode } = require("./ray_game_ids.js");
const { attachRayMatchBetRefs } = require("../../shared/bet_ref.js");
const { login, fetchMatchPage, fetchOdds, oddsPayloadFromMatchRaw } = require("./ray_session.js");
const { RayWsClient } = require("./ray_ws.js");
const { syncRayFromSession } = require("../../esport-api/platform_sync.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RayFeed {
  constructor(options = {}) {
    this.syncIntervalMs = options.syncIntervalMs || 30000;
    this.oddsDelayMs = options.oddsDelayMs || 400;
    this.maxPages = options.maxPages ?? 3;
    this.listeners = new Set();
    this.session = null;
    this.matches = [];
    this.byMatch = {};
    this.odds = {};
    this.wsClient = null;
    this.status = {
      running: false,
      syncing: false,
      ws: false,
      error: null,
      lastSync: null,
      matchCount: 0,
      gateway: null,
    };
    this._syncing = false;
    this._timers = [];
    this._sessionOptions = {
      token: options.token,
      origin: options.origin,
      gateways: options.gateways,
      gameIds: options.gameIds,
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
      status: { ...this.status, aggregateGames: getCatalogSummary() },
      matches: this.matches.map((m) => {
        const game = describePlatformGame("RAY", m.gameId);
        return {
        matchId: m.matchId,
        gameId: m.gameId,
        gameName: game.inCatalog ? game.gameName : getGameName(m.gameId) || m.gameName,
        gameCode: game.inCatalog ? game.gameCode : getGameCode(m.gameId),
        bo: m.bo,
        startTime: m.startTime,
        scheduleScope: m.scheduleScope,
        scheduleLabel: m.scheduleLabel,
        isLive: m.isLive,
        liveStatus: m.liveStatus,
        matchStatus: m.matchStatus,
        score: m.score,
        home: m.home.name,
        away: m.away.name,
        tournament: m.tournament,
        ...(this.byMatch[m.matchId] || {}),
      };
      }),
      updatedAt: Date.now(),
    };
  }

  async start() {
    if (this.status.running) return;
    this.status.running = true;
    if (process.env.RAY_WS !== "0") {
      this.connectWs();
    }
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
    this._timers.forEach(clearInterval);
    this._timers = [];
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.status.ws = false;
  }

  connectWs() {
    this.wsClient = new RayWsClient({
      origin: this._sessionOptions.origin,
      token: this._sessionOptions.token,
    });
    this.wsClient.onOdds((updates) => {
      const grouped = new Map();
      for (const item of updates || []) {
        const matchId = String(item.match_id ?? "");
        if (!matchId) continue;
        if (!grouped.has(matchId)) grouped.set(matchId, []);
        grouped.get(matchId).push(item);
      }
      let touched = false;
      for (const [matchId, items] of grouped) {
        const detail = this.byMatch[matchId];
        if (!detail) continue;
        if (Core.applyWsOddsUpdates(detail, this.odds, items)) {
          detail.updatedAt = Date.now();
          touched = true;
          for (const item of items) {
            const oddsId = String(item.id ?? item.odds_id);
            if (!this.odds[oddsId]) continue;
            this.emit({
              type: "oddsUpdate",
              matchId,
              oddsId,
              odd: Number(item.odds),
              platform: "RAY",
            });
          }
        }
      }
      if (touched) {
        this.emit({ type: "snapshot", data: this.getSnapshot() });
      }
    });
    this.wsClient.onMatch((payload) => {
      const match = this.matches.find((m) => String(m.matchId) === String(payload?.id));
      if (!match || !payload) return;
      const ms = Core.describeMatchStatus(payload);
      match.isLive = ms.isLive === 2;
      match.liveStatus = ms.label;
      match.matchStatus = { code: ms.code, label: ms.label, rawStatus: ms.rawStatus };
      match.score = ms.score;
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    });
    this.wsClient.connect().then((ok) => {
      this.status.ws = Boolean(ok);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    });
  }

  async fetchMatchList() {
    const byId = new Map();
    const filterOpts = {
      gameIds: this.session.gameIds,
    };

    for (let page = 1; page <= this.maxPages; page += 1) {
      const rows = await fetchMatchPage(this.session, page);
      if (!rows.length) break;
      for (const raw of rows) {
        const norm = Core.normalizeMatchListItem(raw, filterOpts);
        if (!norm || byId.has(norm.matchId)) continue;
        byId.set(norm.matchId, norm);
      }
      if (rows.length < 20) break;
      await sleep(200);
    }

    return [...byId.values()].sort((a, b) => a.startTime - b.startTime);
  }

  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    this.status.syncing = true;
    this.emit({ type: "snapshot", data: this.getSnapshot() });

    try {
      this.session = await login(this._sessionOptions);
      syncRayFromSession(this.session);
      this.status.gateway = this.session.gateway;
      this.matches = await this.fetchMatchList();
      this.status.matchCount = this.matches.length;
      this.status.error = null;
      this.emit({ type: "snapshot", data: this.getSnapshot() });

      for (let i = 0; i < this.matches.length; i++) {
        await this.loadMatchOdds(this.matches[i]);
        if (i % 2 === 0 || i === this.matches.length - 1) {
          this.emit({ type: "snapshot", data: this.getSnapshot() });
        }
        await sleep(this.oddsDelayMs);
      }

      this.status.lastSync = Date.now();
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

  async resolveOddsPayload(match) {
    // 比赛列表内嵌 odds 通常只有当前局/全场，完整地图盘必须拉 /v2/odds（与 A8 一致）
    try {
      const payload = await fetchOdds(this.session, match.matchId);
      return { payload, source: "odds_api" };
    } catch (err) {
      const fromList = oddsPayloadFromMatchRaw(match.raw);
      if (fromList) {
        return { payload: fromList, source: "match_list_fallback" };
      }
      throw err;
    }
  }

  async loadMatchOdds(match) {
    try {
      const { payload, source } = await this.resolveOddsPayload(match);
      const built = Core.buildStagesFromOdds(payload, match.home.id, match.away.id);
      Object.assign(this.odds, built.oddsIndex);

      const ms = Core.describeMatchStatus(payload);
      match.isLive = ms.isLive === 2;
      match.liveStatus = ms.label;
      match.matchStatus = { code: ms.code, label: ms.label, rawStatus: ms.rawStatus };
      match.score = ms.score || match.score;

      const gameCode = getGameCode(match.gameId) || "unknown";
      const detail = {
        stages: built.stages,
        winHome: built.winHome,
        winAway: built.winAway,
        winHomeId: built.winHomeId,
        winAwayId: built.winAwayId,
        winLocked: built.winLocked,
        winMarketStatus: built.winMarketStatus,
        winMarket: built.winMarket,
        marketCount: built.marketCount,
        updatedAt: Date.now(),
        error: null,
        oddsSource: source,
      };
      attachRayMatchBetRefs(detail, match.matchId, gameCode);
      this.byMatch[match.matchId] = detail;
    } catch (err) {
      this.byMatch[match.matchId] = {
        stages: [],
        winHome: null,
        winAway: null,
        winLocked: true,
        marketCount: 0,
        updatedAt: Date.now(),
        error: err.message,
      };
    }
  }
}

module.exports = { RayFeed };
