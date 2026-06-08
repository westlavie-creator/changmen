"use strict";

const Core = require("./core.js");
const { describePlatformGame, getCatalogSummary } = require("./_require.js").reqB("core/shared/game_catalog.js");
const { getGameCode } = require("./game_ids.js");
const { attachIaMatchBetRefs } = require("./_require.js").reqB("core/shared/bet_ref.js");
const {
  tryLoadSession,
  fetchGameList,
  fetchPointsList,
  persistPlatform,
} = require("./session.js");
const { IaWsClient } = require("./ws.js");
const { syncIaFromSession } = require("./_require.js").reqB("core/esport-api/platform_sync.js");

class IaFeed {
  constructor(options = {}) {
    this.syncIntervalMs = options.syncIntervalMs || Number(process.env.IA_SYNC_MS || 30000);
    this.eventDelayMs = options.eventDelayMs || Number(process.env.IA_EVENT_DELAY_MS || 300);
    this.listeners = new Set();
    this.session = null;
    this.matches = [];
    this.byMatch = {};
    this.oddsIndex = {};
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
      gateway: options.gateway,
      gameIds: options.gameIds,
      betName: options.betName,
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
        const game = describePlatformGame("IA", m.gameId);
        return {
          matchId: m.matchId,
          gameId: m.gameId,
          gameName: game.inCatalog ? game.gameName : m.gameName,
          gameCode: game.inCatalog ? game.gameCode : getGameCode(m.gameId),
          bo: m.bo,
          startTime: m.startTime,
          isLive: m.isLive,
          score: m.score,
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
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.status.ws = false;
  }

  connectWs() {
    const session = this.session || tryLoadSession();
    if (!session?.gateway) return;

    this.wsClient = new IaWsClient({ gateway: session.gateway });
    this.wsClient.onMessage((msg) => this.handleWsMessage(msg));
    this.wsClient.connect().then((ok) => {
      this.status.ws = Boolean(ok);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    });
  }

  handleWsMessage(msg) {
    if (!msg?.message_type) return;
    let touched = false;

    if (msg.message_type === "message_type_push_point_change") {
      for (const match of this.matches) {
        const detail = this.byMatch[match.matchId];
        if (!detail) continue;
        if (Core.applyWsPointChange(detail, this.oddsIndex, msg)) {
          touched = true;
          const pointId = String(msg.content?.point_id ?? "");
          const side = this.oddsIndex[pointId]?.side;
          const odd = Number(msg.content?.point);
          if (side && !Number.isNaN(odd)) {
            this.emit({
              type: "oddsUpdate",
              matchId: match.matchId,
              oddsId: pointId,
              odd,
              platform: "IA",
            });
          }
        }
      }
    } else if (msg.message_type === "message_type_bet_item_single_lock") {
      const playId = msg.content?.play_id;
      if (!playId) return;
      const locked = msg.content?.status !== 1;
      for (const match of this.matches) {
        const detail = this.byMatch[match.matchId];
        if (detail && Core.applyWsBetLock(detail, playId, locked)) {
          touched = true;
        }
      }
    }

    if (touched) {
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    }
  }

  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    this.status.syncing = true;
    this.emit({ type: "snapshot", data: this.getSnapshot() });

    try {
      const session = tryLoadSession();
      if (!session) {
        this.status.error = "缺少 IA 凭证（IA_GATEWAY + IA_TOKEN 或 platforms.json）";
        this.emit({ type: "snapshot", data: this.getSnapshot() });
        return;
      }
      this.session = { ...session, ...this._sessionOptions, token: this._sessionOptions.token || session.token };
      if (this._sessionOptions.gateway) this.session.gateway = this._sessionOptions.gateway;
      if (this._sessionOptions.gameIds?.length) this.session.gameIds = this._sessionOptions.gameIds;
      if (this._sessionOptions.betName) this.session.betName = this._sessionOptions.betName;

      persistPlatform(this.session);
      syncIaFromSession(this.session);
      this.status.gateway = this.session.gateway;

      const betNameRegex = Core.compileBetName(this.session);
      const list = await fetchGameList(this.session);
      const normalized = [];
      const seen = new Set();
      for (const row of list) {
        const match = Core.normalizeListEvent(row, { gameIds: this.session.gameIds });
        if (!match || seen.has(match.matchId)) continue;
        seen.add(match.matchId);
        normalized.push(match);
      }
      this.matches = normalized.sort((a, b) => a.startTime - b.startTime);
      this.status.matchCount = this.matches.length;
      this.status.error = null;
      this.emit({ type: "snapshot", data: this.getSnapshot() });

      this.oddsIndex = {};
      for (let i = 0; i < this.matches.length; i += 1) {
        await this.loadMatchOdds(this.matches[i], betNameRegex);
        if (i % 3 === 0 || i === this.matches.length - 1) {
          this.emit({ type: "snapshot", data: this.getSnapshot() });
        }
        if (i < this.matches.length - 1) await Core.sleep(this.eventDelayMs);
      }

      this.status.lastSync = Date.now();
      if (process.env.IA_WS !== "0" && !this.wsClient) {
        this.connectWs();
      }
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

  async loadMatchOdds(match, betNameRegex) {
    try {
      const plays = await fetchPointsList(this.session, match.matchId);
      const stages = Core.extractStagesFromPlays(plays, betNameRegex);
      const detail = {
        stages,
        winHome: null,
        winAway: null,
        winLocked: true,
        marketCount: stages.length,
        updatedAt: Date.now(),
        error: null,
      };
      Core.mergeStagesIntoDetail(detail, stages);
      Core.registerOddsIndex(this.oddsIndex, match.matchId, stages);
      const gameCode = getGameCode(match.gameId) || "unknown";
      attachIaMatchBetRefs(detail, match.matchId, gameCode);
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

module.exports = { IaFeed };
