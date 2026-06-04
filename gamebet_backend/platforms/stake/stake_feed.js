"use strict";

const { A8BetsFeed } = require("../../core/integrations/a8/bets_feed.js");
const { getCatalogSummary } = require("../../core/shared/game_catalog.js");
const { attachAggregatorMatchBetRefs } = require("../../core/shared/bet_ref.js");
const { tryLoadSession, fetchAllSports, persistPlatform } = require("./stake_session.js");
const { syncStakeFromSession } = require("../../core/esport-api/platform_sync.js");

class StakeFeed extends A8BetsFeed {
  constructor(options = {}) {
    super({
      platformId: "Stake",
      channels: ["Stake"],
      useDirectIds: true,
      note: "GraphQL 快照（可选）+ A8 聚合 Stake 频道；赔率 key 为 outcome id",
      ...options,
    });
    this.platformId = "Stake";
    this.syncIntervalMs = options.syncIntervalMs || Number(process.env.STAKE_SYNC_MS || 60000);
    this.session = null;
    this._timer = null;
    this.status.graphql = false;
  }

  getSnapshot() {
    const snap = super.getSnapshot();
    snap.status = {
      ...snap.status,
      graphql: this.status.graphql,
      apiUrl: this.session?.apiUrl || null,
    };
    snap.matches = snap.matches.map((m) => {
      const detail = this.byMatch[m.matchId];
      if (detail) attachAggregatorMatchBetRefs(detail, m.matchId, m.gameCode, "Stake");
      return { ...m, ...(detail || {}) };
    });
    snap.status.aggregateGames = getCatalogSummary();
    return snap;
  }

  applyHttpMatches(rows) {
    for (const row of rows) {
      this.ensureMatch({
        matchId: row.matchId,
        gameId: row.gameId,
        gameCode: row.gameCode,
        gameName: row.gameName,
        homeName: row.home.name,
        awayName: row.away.name,
        homeId: row.home.id,
        awayId: row.away.id,
        startTime: row.startTime,
        isLive: row.isLive,
      });
      for (const stage of row.stages || []) {
        this.upsertBetStage(row.matchId, {
          betId: stage.winMarketId,
          homeId: stage.winHomeId,
          awayId: stage.winAwayId,
          home: stage.winHome,
          away: stage.winAway,
          locked: stage.winLocked,
          name: stage.betName,
          map: stage.stageId,
        });
      }
    }
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  async syncGraphql() {
    const session = tryLoadSession();
    if (!session) {
      this.status.graphql = false;
      return;
    }
    this.session = session;
    persistPlatform(session);
    syncStakeFromSession(session);
    const rows = await fetchAllSports(session);
    this.applyHttpMatches(rows);
    this.status.graphql = true;
    this.status.error = null;
  }

  async start() {
    await super.start();
    try {
      await this.syncGraphql();
    } catch (err) {
      this.status.error = err.message;
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    }
    this._timer = setInterval(() => {
      this.syncGraphql().catch((err) => {
        this.status.error = err.message;
        this.emit({ type: "snapshot", data: this.getSnapshot() });
      });
    }, this.syncIntervalMs);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    super.stop();
  }
}

module.exports = { StakeFeed };
