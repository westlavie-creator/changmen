"use strict";

const Core = require("./saba_core.js");
const { SabaWsClient } = require("./saba_ws.js");
const { describePlatformGame, getCatalogSummary } = require("../../shared/game_catalog.js");
const { attachSabaMatchBetRefs } = require("../../shared/bet_ref.js");
const {
  tryLoadSession,
  resolveWsConfig,
  loginCheckin,
  persistPlatform,
} = require("./saba_session.js");
const { syncSabaFromSession } = require("../../esport-api/platform_sync.js");

class SabaFeed {
  constructor(options = {}) {
    this.checkinIntervalMs = options.checkinIntervalMs || Number(process.env.SABA_CHECKIN_MS || 3000);
    this.listeners = new Set();
    this.session = null;
    this.wsConfig = null;
    this.wsClient = null;
    this.matches = [];
    this.byMatch = {};
    this.oddsIndex = {};
    this.matchRows = new Map();
    this.oddRows = new Map();
    this.leagueRows = new Map();
    this.status = {
      running: false,
      ws: false,
      error: null,
      lastUpdate: null,
      matchCount: 0,
      gateway: null,
    };
    this._timers = [];
    this._loopRunning = false;
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
        const game = describePlatformGame("SABA", m.gameId);
        const detail = this.byMatch[m.matchId];
        if (detail) attachSabaMatchBetRefs(detail, m.matchId, game.gameCode || m.gameCode);
        return {
          matchId: m.matchId,
          gameId: m.gameId,
          gameName: game.inCatalog ? game.gameName : m.gameName,
          gameCode: game.inCatalog ? game.gameCode : m.gameCode,
          bo: m.bo,
          startTime: m.startTime,
          isLive: m.isLive,
          home: m.home.name,
          away: m.away.name,
          league: m.leagueName,
          ...(detail || {}),
        };
      }),
      updatedAt: Date.now(),
    };
  }

  onMatchRow(row) {
    if (!row?.matchid) return;
    const id = String(row.matchid);
    const prev = this.matchRows.get(id) || {};
    const merged = { ...prev, ...row };
    if (merged.leagueid) {
      const league = this.leagueRows.get(merged.leagueid);
      if (league?.leaguegroupid) merged.gameId = String(league.leaguegroupid);
    }
    this.matchRows.set(id, merged);
  }

  onOddsRow(row) {
    if (!row?.oddsid) return;
    const id = String(row.oddsid);
    const prev = this.oddRows.get(id) || {};
    this.oddRows.set(id, { ...prev, ...row });
  }

  rebuildFromDone() {
    const gameIds = this.session?.gameIds?.length
      ? this.session.gameIds.map(String)
      : ["43"];
    const normalized = [];
    for (const row of this.matchRows.values()) {
      const match = Core.normalizeMatch(row, gameIds);
      if (match) normalized.push(match);
    }
    this.matches = normalized.sort((a, b) => a.startTime - b.startTime);
    this.byMatch = {};
    this.oddsIndex = {};

    for (const match of this.matches) {
      const stages = [];
      for (const odd of this.oddRows.values()) {
        if (String(odd.matchid) !== match.matchId) continue;
        const stage = Core.normalizeOdds(odd, match);
        if (stage) stages.push(stage);
      }
      stages.sort((a, b) => a.stageId - b.stageId);
      const primary = stages.find((s) => s.stageId === 0) || stages[0];
      this.byMatch[match.matchId] = {
        stages,
        winHome: primary?.winHome ?? null,
        winAway: primary?.winAway ?? null,
        winLocked: primary?.winLocked ?? false,
        marketCount: stages.length,
        updatedAt: Date.now(),
        error: null,
      };
      for (const stage of stages) {
        this.oddsIndex[stage.winHomeId] = { matchId: match.matchId, side: "home", stageId: stage.stageId };
        this.oddsIndex[stage.winAwayId] = { matchId: match.matchId, side: "away", stageId: stage.stageId };
      }
    }

    this.status.matchCount = this.matches.length;
    this.status.lastUpdate = Date.now();
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  applyOddsUpdate(row) {
    if (!row?.oddsid || !row?.matchid) return;
    this.onOddsRow(row);
    const matchId = String(row.matchid);
    const match = this.matches.find((m) => m.matchId === matchId);
    if (!match) return;
    const stage = Core.normalizeOdds(row, match);
    if (!stage) return;
    let detail = this.byMatch[matchId];
    if (!detail) {
      detail = { stages: [], winHome: null, winAway: null, winLocked: false, marketCount: 0, updatedAt: Date.now() };
      this.byMatch[matchId] = detail;
    }
    const idx = detail.stages.findIndex((s) => s.winMarketId === stage.winMarketId);
    if (idx >= 0) detail.stages[idx] = stage;
    else detail.stages.push(stage);
    detail.stages.sort((a, b) => a.stageId - b.stageId);
    const primary = detail.stages.find((s) => s.stageId === 0) || detail.stages[0];
    detail.winHome = primary?.winHome ?? null;
    detail.winAway = primary?.winAway ?? null;
    detail.winLocked = primary?.winLocked ?? false;
    detail.marketCount = detail.stages.length;
    detail.updatedAt = Date.now();
    this.oddsIndex[stage.winHomeId] = { matchId, side: "home", stageId: stage.stageId };
    this.oddsIndex[stage.winAwayId] = { matchId, side: "away", stageId: stage.stageId };
    this.status.lastUpdate = Date.now();
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  lockOdds(oddsId) {
    for (const detail of Object.values(this.byMatch)) {
      for (const stage of detail.stages || []) {
        if (stage.winMarketId === oddsId) {
          stage.winLocked = true;
          detail.winLocked = true;
        }
      }
    }
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  async connectOnce() {
    const session = tryLoadSession();
    if (!session) {
      this.status.error = "缺少 SABA 凭证（SABA_GATEWAY + SABA_TOKEN 或 platforms.json）";
      return false;
    }
    this.session = session;
    this.status.gateway = session.gateway;
    syncSabaFromSession(session);

    const wsConfig = await resolveWsConfig(session);
    this.wsConfig = wsConfig;
    persistPlatform(session, wsConfig);

    if (this.wsClient) this.wsClient.disconnect();
    this.wsClient = new SabaWsClient(wsConfig, {
      onReset: () => {
        this.matchRows.clear();
        this.oddRows.clear();
      },
      onDone: () => this.rebuildFromDone(),
      onMatch: (row) => this.onMatchRow(row),
      onMatchRemove: (id) => {
        this.matchRows.delete(id);
      },
      onOdds: (row) => this.applyOddsUpdate(row),
      onOddsLock: (id) => this.lockOdds(id),
      onDisconnect: () => {
        this.status.ws = false;
      },
      onError: (msg) => {
        this.status.error = String(msg);
      },
    });

    const ok = await this.wsClient.connect();
    this.status.ws = ok;
    if (!ok) {
      this.status.error = this.wsClient.lastError || "SABA WebSocket 连接失败";
    }
    return ok;
  }

  async runLoop() {
    if (this._loopRunning) return;
    this._loopRunning = true;
    while (this.status.running) {
      try {
        await this.connectOnce();
        const started = Date.now();
        while (this.status.running && this.wsClient?.connected) {
          if (this.wsConfig?.checkinUrl) {
            await loginCheckin(this.wsConfig).catch(() => {});
          }
          await new Promise((r) => setTimeout(r, this.checkinIntervalMs));
          if (Date.now() - started > 300000) {
            this.wsClient?.disconnect();
            break;
          }
        }
      } catch (err) {
        this.setError(err);
      }
      if (this.status.running) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    this._loopRunning = false;
  }

  async start() {
    if (this.status.running) return;
    this.status.running = true;
    this.runLoop().catch((err) => this.setError(err));
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
    for (const t of this._timers) clearInterval(t);
    this._timers = [];
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.status.ws = false;
  }
}

module.exports = { SabaFeed };
