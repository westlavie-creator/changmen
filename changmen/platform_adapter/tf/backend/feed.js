"use strict";

const Core = require("./core.js");
const { describePlatformGame, getCatalogSummary } = require("./_require.js").reqB("core/shared/game_catalog.js");
const { getGameCode } = require("./game_ids.js");
const { attachTfMatchBetRefs } = require("./_require.js").reqB("core/shared/bet_ref.js");
const {
  tryLoadSession,
  loadSession,
  fetchTodayEvents,
  fetchEventMarkets,
  persistPlatform,
} = require("./session.js");
const { TfWsClient } = require("./ws.js");
const { syncTfFromSession } = require("./_require.js").reqB("core/esport-api/platform_sync.js");

class TfFeed {
  constructor(options = {}) {
    this.syncIntervalMs = options.syncIntervalMs || Number(process.env.TF_SYNC_MS || 30000);
    this.eventDelayMs = options.eventDelayMs || Number(process.env.TF_EVENT_DELAY_MS || 1000);
    this.horizonMs = options.horizonMs || 3600 * 1000;
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
    this._syncLoop = null;
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
        const game = describePlatformGame("TF", m.gameId);
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
    this._syncLoop = () => {
      this.sync().catch((err) => this.setError(err));
    };
    this._timers.push(setInterval(this._syncLoop, this.syncIntervalMs));
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
    if (!session?.gateway || !session?.token) return;

    this.wsClient = new TfWsClient({
      gateway: session.gateway,
      token: session.token,
      useA8Proxy: process.env.TF_WS_A8 === "1",
    });
    this.wsClient.onOdds((payload) => {
      let touched = false;
      for (const match of this.matches) {
        const detail = this.byMatch[match.matchId];
        if (!detail) continue;
        if (Core.applyWsOddsUpdates(detail, this.oddsIndex, payload)) {
          touched = true;
          const marketId = String(payload?.data?.market_id ?? "");
          for (const sel of payload?.data?.selection || []) {
            const oddsId = Core.selectionOddsId(marketId, sel.name);
            this.emit({
              type: "oddsUpdate",
              matchId: match.matchId,
              oddsId,
              odd: Number(sel.euro_odds),
              platform: "TF",
            });
          }
        }
      }
      if (touched) {
        this.emit({ type: "snapshot", data: this.getSnapshot() });
      }
    });
    this.wsClient.connect().then((ok) => {
      this.status.ws = Boolean(ok);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    });
  }

  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    this.status.syncing = true;
    this.emit({ type: "snapshot", data: this.getSnapshot() });

    try {
      const session = tryLoadSession();
      if (!session) {
        this.status.error = "缺少 TF 凭证（TF_GATEWAY + TF_TOKEN 或 platforms.json）";
        this.emit({ type: "snapshot", data: this.getSnapshot() });
        return;
      }
      this.session = { ...session, ...this._sessionOptions, token: this._sessionOptions.token || session.token };
      if (this._sessionOptions.gateway) this.session.gateway = this._sessionOptions.gateway;
      if (this._sessionOptions.gameIds?.length) this.session.gameIds = this._sessionOptions.gameIds;
      if (this._sessionOptions.betName) this.session.betName = this._sessionOptions.betName;

      persistPlatform(this.session);
      syncTfFromSession(this.session);
      this.status.gateway = this.session.gateway;

      const betNameRegex = Core.compileBetName(this.session);
      const list = await fetchTodayEvents(this.session);
      const filter = { gameIds: this.session.gameIds, horizonMs: this.horizonMs };
      const normalized = [];
      const seen = new Set();
      for (const row of list) {
        const match = Core.normalizeListEvent(row, filter);
        if (!match || seen.has(match.matchId)) continue;
        seen.add(match.matchId);
        normalized.push(match);
      }
      this.matches = normalized.sort((a, b) => a.startTime - b.startTime);
      this.status.matchCount = this.matches.length;
      this.status.error = null;
      this.emit({ type: "snapshot", data: this.getSnapshot() });

      for (let i = 0; i < this.matches.length; i += 1) {
        await this.loadMatchOdds(this.matches[i], betNameRegex);
        if (i % 2 === 0 || i === this.matches.length - 1) {
          this.emit({ type: "snapshot", data: this.getSnapshot() });
        }
        if (i < this.matches.length - 1) await Core.sleep(this.eventDelayMs);
      }

      this.status.lastSync = Date.now();
      if (process.env.TF_WS !== "0" && !this.wsClient) {
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
      const detail = {
        stages: [],
        winHome: null,
        winAway: null,
        winLocked: true,
        marketCount: 0,
        updatedAt: Date.now(),
        error: null,
      };

      const tabs = [{ tab_name: "MATCH", mapOption: "", marketOption: "MATCH" }];
      for (const tab of match.marketTabs || []) {
        const meta = Core.stageFromTabName(tab.tab_name);
        if (meta && meta.stageId > 0) {
          tabs.push({ tab_name: tab.tab_name, mapOption: meta.mapOption, marketOption: "MAP" });
        }
      }

      for (const tab of tabs) {
        const results = await fetchEventMarkets(this.session, match.matchId, {
          marketOption: tab.marketOption,
          mapOption: tab.mapOption,
        });
        const built = Core.extractWinMarketsFromResults(results, betNameRegex);
        Core.mergeStagesIntoDetail(detail, built);
        Core.registerOddsIndex(this.oddsIndex, match.matchId, built);
        if (tab.marketOption === "MATCH") {
          await Core.sleep(this.eventDelayMs);
        }
      }

      detail.marketCount = detail.stages.length;
      const gameCode = getGameCode(match.gameId) || "unknown";
      attachTfMatchBetRefs(detail, match.matchId, gameCode);
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

module.exports = { TfFeed };
