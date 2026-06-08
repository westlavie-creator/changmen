"use strict";

const { A8BetsFeed } = require("./_require.js").reqB("core/integrations/a8/bets_feed.js");
const { attachAggregatorMatchBetRefs } = require("./_require.js").reqB("core/shared/bet_ref.js");
const { syncXbetFromEnv } = require("./_require.js").reqB("core/esport-api/platform_sync.js");

class XbetFeed extends A8BetsFeed {
  constructor(options = {}) {
    super({
      platformId: "XBet",
      channels: ["XBet", "XBet:Score"],
      homeSuffix: "1",
      awaySuffix: "3",
      note: "A8 聚合 Socket.IO 频道 XBet / XBet:Score；赔率 key 为 {betId}:1 / {betId}:3",
      ...options,
    });
    this.platformId = "XBet";
  }

  getSnapshot() {
    const snap = super.getSnapshot();
    snap.matches = snap.matches.map((m) => {
      const detail = this.byMatch[m.matchId];
      if (detail) attachAggregatorMatchBetRefs(detail, m.matchId, m.gameCode, "XBet");
      return { ...m, ...(detail || {}) };
    });
    return snap;
  }

  async start() {
    syncXbetFromEnv();
    await super.start();
  }
}

module.exports = { XbetFeed };
