"use strict";

const Core = require("./imt_core.js");
const { describePlatformGame, getCatalogSummary } = require("../../core/shared/game_catalog.js");
const { getSportCode } = require("./imt_sport_ids.js");
const { attachImtMatchBetRefs } = require("../../core/shared/bet_ref.js");
const {
  tryLoadSession,
  fetchAllLiveEvents,
  fetchLiveEventsDelta,
  persistPlatform,
} = require("./imt_session.js");
const { syncImtFromSession } = require("../../core/esport-api/platform_sync.js");

class ImtFeed {
  constructor(options = {}) {
    this.fullIntervalMs = options.fullIntervalMs || Number(process.env.IMT_FULL_MS || 60000);
    this.deltaIntervalMs = options.deltaIntervalMs || Number(process.env.IMT_DELTA_MS || 1000);
    this.listeners = new Set();
    this.session = null;
    this.matches = [];
    this.byMatch = {};
    this.oddsIndex = {};
    this.deltaToken = null;
    this.activeSportIds = [];
    this.status = {
      running: false,
      syncing: false,
      delta: false,
      error: null,
      lastSync: null,
      lastDelta: null,
      matchCount: 0,
      gateway: null,
    };
    this._fullSyncing = false;
    this._deltaSyncing = false;
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
        const game = describePlatformGame("IMT", m.gameId);
        return {
          matchId: m.matchId,
          gameId: m.gameId,
          gameName: game.inCatalog ? game.gameName : m.gameName,
          gameCode: game.inCatalog ? game.gameCode : getSportCode(m.gameId),
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
        this.syncFull().catch((err) => this.setError(err));
      }, this.fullIntervalMs)
    );
    this._timers.push(
      setInterval(() => {
        this.syncDelta().catch((err) => this.setError(err));
      }, this.deltaIntervalMs)
    );
    await this.syncFull();
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
    for (const timer of this._timers) clearInterval(timer);
    this._timers = [];
  }

  ensureSession() {
    const session = tryLoadSession();
    if (!session) {
      this.status.error = "缺少 IMT 凭证（IMT_GATEWAY + IMT_TOKEN 或 platforms.json）";
      return null;
    }
    this.session = session;
    this.status.gateway = session.gateway;
    persistPlatform(session);
    syncImtFromSession(session);
    return session;
  }

  async syncFull() {
    if (this._fullSyncing) return;
    this._fullSyncing = true;
    this.status.syncing = true;
    this.emit({ type: "snapshot", data: this.getSnapshot() });

    try {
      const session = this.ensureSession();
      if (!session) {
        this.emit({ type: "snapshot", data: this.getSnapshot() });
        return;
      }

      const data = await fetchAllLiveEvents(session, session.sportIds);
      const parsed = Core.normalizeFullPayload(data);
      this.deltaToken = parsed.delta;
      this.activeSportIds = parsed.sportIds.length ? parsed.sportIds : session.sportIds;
      this.matches = parsed.matches.sort((a, b) => a.startTime - b.startTime);
      this.status.matchCount = this.matches.length;
      this.oddsIndex = {};
      this.byMatch = {};

      for (const match of this.matches) {
        const detail = Core.buildDetailFromMatch(match);
        Core.registerOddsIndex(this.oddsIndex, match.matchId, detail.stages);
        attachImtMatchBetRefs(detail, match.matchId, getSportCode(match.gameId));
        this.byMatch[match.matchId] = detail;
      }

      this.status.error = null;
      this.status.lastSync = Date.now();
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    } catch (err) {
      this.setError(err);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
      throw err;
    } finally {
      this.status.syncing = false;
      this._fullSyncing = false;
    }
  }

  async syncDelta() {
    if (this._deltaSyncing || !this.deltaToken) return;
    const session = this.ensureSession();
    if (!session) return;

    this._deltaSyncing = true;
    this.status.delta = true;

    try {
      const sportIds = this.activeSportIds.length ? this.activeSportIds : session.sportIds;
      const data = await fetchLiveEventsDelta(session, sportIds, this.deltaToken);
      this.deltaToken = data.Delta ?? this.deltaToken;
      const changes = Core.flattenDeltaChanges(data);
      if (!changes.length) return;

      let touched = false;
      for (const change of changes) {
        const ref = this.oddsIndex[change.oddsId];
        if (!ref) continue;
        const detail = this.byMatch[ref.matchId];
        if (!detail) continue;
        if (Core.applyDeltaToDetail(detail, change.row)) {
          touched = true;
          this.emit({
            type: "oddsUpdate",
            matchId: ref.matchId,
            oddsId: change.oddsId,
            odd: change.odd,
            platform: "IMT",
          });
        }
      }
      if (touched) {
        this.status.lastDelta = Date.now();
        this.emit({ type: "snapshot", data: this.getSnapshot() });
      }
    } catch (err) {
      console.warn("[imt-feed] delta skip:", err.message);
    } finally {
      this.status.delta = false;
      this._deltaSyncing = false;
    }
  }
}

module.exports = { ImtFeed };
