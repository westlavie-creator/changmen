"use strict";

const { A8SocketClient } = require("./a8_socket.js");
const { getCatalogSummary } = require("./game_catalog.js");
const { pickStr, resolveImMap, imBetNameIsCollectible } = require("./im_parse.js");

/**
 * A8 聚合频道 Feed 基类（IM / XBet / Stake）。
 */
class A8BetsFeed {
  constructor(options = {}) {
    this.platformId = options.platformId || "UNKNOWN";
    this.channels = options.channels || [];
    this.homeSuffix = options.homeSuffix || "1";
    this.awaySuffix = options.awaySuffix || "2";
    this.useDirectIds = Boolean(options.useDirectIds);
    this.listeners = new Set();
    this.matches = [];
    this.byMatch = {};
    this.oddsIndex = {};
    this.wsClient = null;
    this.status = {
      running: false,
      ws: false,
      error: null,
      lastUpdate: null,
      matchCount: 0,
      mode: "a8_aggregator",
      note: options.note || "依赖 A8 聚合 Socket.IO 推送",
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
      matches: this.matches.map((m) => ({
        matchId: m.matchId,
        gameId: m.gameId,
        gameName: m.gameName,
        gameCode: m.gameCode,
        bo: m.bo,
        startTime: m.startTime,
        isLive: m.isLive,
        home: m.home.name,
        away: m.away.name,
        league: m.leagueName,
        ...(this.byMatch[m.matchId] || {}),
      })),
      updatedAt: Date.now(),
    };
  }

  oddsIds(bet) {
    if (this.useDirectIds) {
      return {
        homeId: String(bet.homeId),
        awayId: String(bet.awayId),
        marketId: String(bet.betId || bet.marketId || ""),
      };
    }
    const betId = String(bet.betId);
    return {
      homeId: `${betId}:${this.homeSuffix}`,
      awayId: `${betId}:${this.awaySuffix}`,
      marketId: betId,
    };
  }

  ensureMatch(meta) {
    const matchId = String(meta.matchId);
    let match = this.matches.find((m) => m.matchId === matchId);
    if (!match) {
      match = {
        matchId,
        gameId: meta.gameId || "unknown",
        gameCode: meta.gameCode || "unknown",
        gameName: meta.gameName || "",
        bo: meta.bo || 0,
        startTime: meta.startTime || Date.now(),
        isLive: meta.isLive !== false,
        leagueName: meta.leagueName || "",
        home: { id: meta.homeId || "", name: meta.homeName || "主队" },
        away: { id: meta.awayId || "", name: meta.awayName || "客队" },
      };
      this.matches.push(match);
      this.byMatch[matchId] = {
        stages: [],
        winHome: null,
        winAway: null,
        winLocked: false,
        marketCount: 0,
        updatedAt: Date.now(),
        error: null,
      };
    } else {
      if (meta.homeName) match.home.name = meta.homeName;
      if (meta.awayName) match.away.name = meta.awayName;
      if (meta.leagueName) match.leagueName = meta.leagueName;
      if (meta.gameId) match.gameId = meta.gameId;
      if (meta.gameCode) match.gameCode = meta.gameCode;
    }
    return match;
  }

  upsertBetStage(matchId, bet, stageMeta = {}) {
    const ids = this.oddsIds(bet);
    const match = this.ensureMatch({
      matchId,
      homeName: bet.homeName,
      awayName: bet.awayName,
      ...stageMeta,
    });
    const detail = this.byMatch[matchId];
    const stageId = Number(stageMeta.stageId) || 0;
    let stage = detail.stages.find((s) => s.stageId === stageId && s.winMarketId === ids.marketId);
    if (!stage) {
      stage = {
        stageId,
        label: stageMeta.label || (stageId === 0 ? "全场" : `地图${stageId}`),
        winMarketId: ids.marketId,
        winHomeId: ids.homeId,
        winAwayId: ids.awayId,
        winHome: null,
        winAway: null,
        winLocked: false,
      };
      detail.stages.push(stage);
    }
    if (bet.home != null) stage.winHome = Number(bet.home);
    if (bet.away != null) stage.winAway = Number(bet.away);
    if (bet.name) stage.betName = bet.name;
    stage.winLocked = Boolean(bet.locked);

    this.oddsIndex[ids.homeId] = { matchId, side: "home", stageId };
    this.oddsIndex[ids.awayId] = { matchId, side: "away", stageId };

    const primary = detail.stages.find((s) => s.stageId === 0) || detail.stages[0];
    if (primary) {
      detail.winHome = primary.winHome;
      detail.winAway = primary.winAway;
      detail.winLocked = primary.winLocked;
    }
    detail.marketCount = detail.stages.length;
    detail.updatedAt = Date.now();
    this.status.matchCount = this.matches.length;
    this.status.lastUpdate = Date.now();
    return { match, ids, stage };
  }

  handleBetsMessage(message) {
    if (!message?.bets?.length) return false;
    let touched = false;
    const matchId = message.matchId != null ? String(message.matchId) : null;

    for (const bet of message.bets) {
      const id = matchId || String(bet.matchId || "");
      if (!id) continue;
      const betName = pickStr(bet, "name", "Name", "betName", "BetName");
      if (this.platformId === "IM" && betName && !imBetNameIsCollectible(betName)) {
        continue;
      }
      const stageId =
        this.platformId === "IM" ? resolveImMap(bet) : Number(bet.map ?? 0) || 0;
      const meta = { matchId: id, label: betName || undefined, stageId };
      if (this.platformId === "IM") {
        const sportId =
          pickStr(bet, "sportId", "SportId", "gameId", "GameId") ||
          pickStr(message, "gameId", "GameId", "sportId", "SportId");
        if (sportId) meta.gameId = sportId;
      }
      this.upsertBetStage(id, bet, meta);
      touched = true;
    }
    if (touched) {
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    }
    return touched;
  }

  handleScoreMessage(message) {
    if (!message?.matchId && !message?.id) return false;
    const matchId = String(message.matchId || message.id);
    const match = this.matches.find((m) => m.matchId === matchId);
    if (!match) return false;
    if (message.home != null && message.away != null) {
      match.score = { home: Number(message.home), away: Number(message.away) };
      this.emit({ type: "snapshot", data: this.getSnapshot() });
      return true;
    }
    return false;
  }

  async start() {
    if (this.status.running) return;
    this.status.running = true;
    this.wsClient = new A8SocketClient();
    for (const ch of this.channels) {
      if (ch.endsWith(":Score")) {
        this.wsClient.onChannel(ch, (msg) => this.handleScoreMessage(msg));
      } else {
        this.wsClient.onChannel(ch, (msg) => this.handleBetsMessage(msg));
      }
    }
    const rooms = [...new Set(this.channels.map((c) => c.split(":")[0]))];
    const ok = await this.wsClient.connect(rooms);
    this.status.ws = ok;
    if (!ok) {
      this.status.error = this.wsClient.lastError || "A8 Socket.IO 连接失败";
    }
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }
    this.status.ws = false;
  }
}

module.exports = { A8BetsFeed };
