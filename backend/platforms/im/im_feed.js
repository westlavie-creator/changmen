"use strict";

const { A8BetsFeed } = require("../../shared/a8_bets_feed.js");
const { attachAggregatorMatchBetRefs } = require("../../shared/bet_ref.js");
const { syncImFromEnv } = require("../../esport-api/platform_sync.js");

class ImFeed extends A8BetsFeed {
  constructor(options = {}) {
    super({
      platformId: "IM",
      channels: ["IM"],
      homeSuffix: "1",
      awaySuffix: "2",
      note: "A8 聚合 Socket.IO 频道 IM；赔率 key 为 {betId}:1 / {betId}:2",
      ...options,
    });
    this.platformId = "IM";
  }

  getSnapshot() {
    const snap = super.getSnapshot();
    snap.matches = snap.matches.map((m) => {
      const detail = this.byMatch[m.matchId];
      if (detail) attachAggregatorMatchBetRefs(detail, m.matchId, m.gameCode, "IM");
      return { ...m, ...(detail || {}) };
    });
    return snap;
  }

  async start() {
    syncImFromEnv();
    await super.start();
  }
}

module.exports = { ImFeed };
