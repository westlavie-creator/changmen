(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ObCollectorCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function cleanText(value) {
    return String(value == null ? "" : value).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }

  function decodeBase64Json(value) {
    if (!value) return {};
    const decoded = decodeURIComponent(String(value));
    const binary = typeof atob === "function"
      ? atob(decoded)
      : Buffer.from(decoded, "base64").toString("binary");
    const text = typeof TextDecoder !== "undefined"
      ? new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)))
      : Buffer.from(binary, "binary").toString("utf8");
    return JSON.parse(text);
  }

  function parseObEntryUrl(rawUrl) {
    const url = new URL(String(rawUrl));
    const addrRaw = url.searchParams.get("addr") || "";
    return {
      pageUrl: url.toString(),
      token: url.searchParams.get("token") || "",
      lang: url.searchParams.get("lang") || "",
      domain: url.searchParams.get("domain") || "",
      addr: addrRaw ? decodeBase64Json(addrRaw) : {}
    };
  }

  function normalizeGameIndex(response) {
    if (!response || response.status !== "true" || !Array.isArray(response.data)) return [];
    return response.data.map(item => {
      const teams = cleanText(item.match_team).split(",").map(cleanText);
      const teamIds = String(item.team_id || "").split(",").map(cleanText);
      return {
        provider: "OB",
        matchId: String(item.id),
        gameId: String(item.game_id),
        bo: numberOrZero(item.bo),
        startTime: numberOrZero(item.start_time) * 1000,
        home: { id: teamIds[0] || "", name: teams[0] || "" },
        away: { id: teamIds[1] || "", name: teams[1] || "" },
        raw: item
      };
    }).filter(item => item.matchId && item.home.name && item.away.name);
  }

  function normalizeGameView(matchId, stageId, response) {
    if (!response || response.status !== "true" || !Array.isArray(response.data)) return [];
    const out = [];
    response.data.forEach(market => {
      const round = numberOrZero(market.round);
      const locked = market.status !== 6 || market.visible !== 1 || market.suspended !== 0;
      const odds = Object.keys(market.odds || {}).map(key => {
        const item = market.odds[key];
        return {
          oddsId: String(item.id),
          name: cleanText(item.name),
          odd: numberOrZero(item.odd),
          marketId: String(market.id),
          side: item.name === "@T1" ? "home" : item.name === "@T2" ? "away" : "unknown",
          raw: item
        };
      });
      out.push({
        provider: "OB",
        matchId: String(matchId),
        stageId: numberOrZero(stageId),
        marketId: String(market.id),
        marketName: `[${round === 0 ? "全场" : `地图${round}`}]-${cleanText(market.cn_name)}`,
        round,
        status: market.status,
        visible: market.visible,
        suspended: market.suspended,
        locked,
        odds,
        raw: market
      });
    });
    return out;
  }

  function parseMqttTopic(rawTopic) {
    const match = /^(.+?)(\d+)$/.exec(String(rawTopic || ""));
    if (!match) return { topic: String(rawTopic || ""), matchId: "", type: "unknown" };
    const topic = match[1];
    const known = {
      "/market/oddsUpdate/": "market.oddsUpdate",
      "/market/statusUpdate/": "market.statusUpdate",
      "/market/suspended/": "market.suspended",
      "/market/visible/": "market.visible",
      "/market/sortCodeUpdate/": "market.sortCodeUpdate",
      "/odd/insert/": "odd.insert",
      "/odd/statusUpdate/": "odd.statusUpdate",
      "/odd/visible/": "odd.visible",
      "/odd/suspended/": "odd.suspended"
    };
    return {
      topic,
      matchId: match[2],
      type: known[topic] || topic.replace(/^\/|\/$/g, "").replace(/\//g, ".")
    };
  }

  function applyOddsUpdate(state, update) {
    if (!state.currentOdds) state.currentOdds = {};
    const payload = Array.isArray(update.payload) ? update.payload : [];
    payload.forEach(item => {
      const oddsId = String(item.id || item.odds_id || "");
      if (!oddsId) return;
      const existing = state.currentOdds[oddsId] || {};
      state.currentOdds[oddsId] = Object.assign({}, existing, {
        provider: "OB",
        matchId: String(update.matchId || existing.matchId || ""),
        marketId: String(item.market_id || item.marketId || existing.marketId || ""),
        oddsId,
        odd: numberOrZero(item.odd ?? item.odds ?? existing.odd),
        updatedAt: update.receivedAt || Date.now(),
        raw: item
      });
    });
    return state;
  }

  function applyMarketLockUpdate(state, update, locked) {
    if (!state.currentOdds) state.currentOdds = {};
    const payload = Array.isArray(update.payload) ? update.payload : [];
    payload.forEach(item => {
      const marketId = String(item.market_id || item.id || "");
      Object.keys(state.currentOdds).forEach(oddsId => {
        const current = state.currentOdds[oddsId];
        if (current.marketId === marketId) {
          current.locked = typeof locked === "function" ? locked(item) : locked;
          current.updatedAt = update.receivedAt || Date.now();
        }
      });
    });
    return state;
  }

  return {
    parseObEntryUrl,
    normalizeGameIndex,
    normalizeGameView,
    parseMqttTopic,
    applyOddsUpdate,
    applyMarketLockUpdate
  };
});
