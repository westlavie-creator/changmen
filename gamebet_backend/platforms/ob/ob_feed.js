"use strict";

const mqtt = require("mqtt");
const Core = require("./ob_core.js");
const { describePlatformGame, getActivePlatformGameIds, getCatalogSummary, getGameCodeForPlatformId } = require("../../shared/game_catalog.js");
const { attachObMatchBetRefs } = require("../../shared/bet_ref.js");
const { obGet, fetchGameView, fetchGetTimer } = require("./ob_session.js");
const { resolveObSession } = require("../../esport-api/platform_sync.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTournament(raw) {
  return String(raw || "").replace(/&nbsp;/g, " ").trim();
}

function applyOddsChange(detail, change) {
  if (!detail?.stages?.length) {
    if (change.oddsId === detail.winHomeId) detail.winHome = change.odd;
    if (change.oddsId === detail.winAwayId) detail.winAway = change.odd;
    return;
  }
  for (const stage of detail.stages) {
    if (change.oddsId === stage.winHomeId) {
      stage.winHome = change.odd;
      if (stage.stageId === 0) detail.winHome = change.odd;
    }
    if (change.oddsId === stage.winAwayId) {
      stage.winAway = change.odd;
      if (stage.stageId === 0) detail.winAway = change.odd;
    }
  }
}

function applyMarketLock(detail, oddsIndex, change) {
  const marketId = String(change.marketId || "");
  if (!marketId) return;

  const touch = (stage) => {
    const homeRow = stage.winHomeId ? oddsIndex[stage.winHomeId] : null;
    if (homeRow?.marketId !== marketId) return;
    stage.winLocked = change.locked;
    if (homeRow) homeRow.locked = change.locked;
    const prev = stage.winMarketStatus || {};
    stage.winMarketStatus = {
      ...prev,
      locked: change.locked,
      code: change.locked ? prev.code && prev.code !== "open" ? prev.code : "locked" : "open",
      label: change.locked ? prev.label && prev.label !== "可投注" ? prev.label : "锁盘" : "可投注",
    };
  };

  if (detail.stages?.length) {
    detail.stages.forEach(touch);
  } else if (detail.winHomeId && oddsIndex[detail.winHomeId]?.marketId === marketId) {
    detail.winLocked = change.locked;
  }
}

const DEFAULT_INDEX_SOURCES = [
  { flag: 0, day: 0, scope: "all" },
  { flag: 1, day: 1, scope: "today" },
  { flag: 2, day: 1, scope: "tomorrow" },
  { flag: 2, day: 2, scope: "future" },
  { flag: 2, day: 3, scope: "future" },
];

class ObFeed {
  constructor(options = {}) {
    this.indexSources = options.indexSources || DEFAULT_INDEX_SOURCES;
    this.gameId = options.gameId || "0";
    this.allowedGameIds = new Set(
      (options.allowedGameIds || getActivePlatformGameIds("OB")).map(String)
    );
    this.indexIntervalMs = options.indexIntervalMs || 30000;
    this.indexFetchDelayMs = options.indexFetchDelayMs || 650;
    this.stageDelayMs = options.stageDelayMs || 150;
    this.listeners = new Set();
    this.session = null;
    this.matches = [];
    this.byMatch = {};
    this.odds = {};
    this.liveTimers = {};
    this.mqttClient = null;
    this.subscribedMatchIds = new Set();
    this.status = {
      running: false,
      syncing: false,
      mqtt: false,
      error: null,
      lastSync: null,
      matchCount: 0,
      loadingOdds: false,
    };
    this._syncing = false;
    this._loadingOdds = false;
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
        const game = describePlatformGame("OB", m.gameId);
        return {
        matchId: m.matchId,
        gameId: m.gameId,
        gameName: game.gameName,
        gameCode: game.gameCode,
        bo: m.bo,
        startTime: m.startTime,
        scheduleScope: m.scheduleScope,
        scheduleLabel: m.scheduleLabel,
        isLive: m.isLive,
        liveStatus: Core.liveStatusLabel(m.isLive),
        matchStatus: m.matchStatus,
        score: m.score,
        suspended: m.suspended,
        visible: m.visible,
        home: m.home.name,
        away: m.away.name,
        tournament: formatTournament(m.raw?.tournament_cn_name),
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
      }, this.indexIntervalMs)
    );
    await this.sync();
    this.emit({ type: "snapshot", data: this.getSnapshot() });
  }

  stop() {
    this.status.running = false;
    this._timers.forEach(clearInterval);
    this._timers = [];
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
    this.status.mqtt = false;
  }

  async fetchMatchList() {
    const byId = new Map();
    const errors = [];

    for (const src of this.indexSources) {
      const path = Core.buildGameIndexQuery({
        gameId: this.gameId,
        flag: src.flag,
        day: src.day,
      });
      try {
        const index = await obGet(
          this.session.gateway,
          path,
          this.session.token,
          this.session.lang
        );
        if (index.json.status === "false") {
          errors.push(index.json.data || path);
          await sleep(this.indexFetchDelayMs);
          continue;
        }
        const desc = Core.describeIndexSource(src.flag, src.day);
        for (const match of Core.normalizeGameIndex(index.json)) {
          if (byId.has(match.matchId)) continue;
          byId.set(match.matchId, {
            ...match,
            scheduleScope: src.scope || desc.scope,
            scheduleLabel: desc.label,
            indexFlag: src.flag,
            indexDay: src.day,
          });
        }
      } catch (err) {
        errors.push(`${path}: ${err.message}`);
      }
      await sleep(this.indexFetchDelayMs);
    }

    if (!byId.size && errors.length) {
      throw new Error(errors[0]);
    }

    return [...byId.values()]
      .filter((m) => this.allowedGameIds.has(String(m.gameId)))
      .sort((a, b) => a.startTime - b.startTime);
  }

  async sync() {
    if (this._syncing) return;
    this._syncing = true;
    this.status.syncing = true;
    this.emit({ type: "snapshot", data: this.getSnapshot() });

    try {
      this.session = await resolveObSession();
      if (!this.status.mqtt) {
        this.connectMqtt();
      }
      this.matches = await this.fetchMatchList();
      this.status.matchCount = this.matches.length;
      this.status.error = null;
      await this.refreshLiveTimers();
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    } catch (err) {
      this.setError(err);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
      throw err;
    } finally {
      this.status.syncing = false;
      this._syncing = false;
    }

    this.loadAllOddsInBackground().catch((err) => this.setError(err));
  }

  async loadAllOddsInBackground() {
    if (this._loadingOdds || !this.matches.length) return;
    this._loadingOdds = true;
    this.status.loadingOdds = true;
    this.emit({ type: "status", status: { ...this.status } });

    try {
      for (let i = 0; i < this.matches.length; i++) {
        await this.loadMatchSnapshot(this.matches[i]);
        if (i % 5 === 0 || i === this.matches.length - 1) {
          this.emit({ type: "snapshot", data: this.getSnapshot() });
        }
        await sleep(150);
      }

      this.status.lastSync = Date.now();
      this.resubscribeAll();
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    } catch (err) {
      this.setError(err);
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    } finally {
      this.status.loadingOdds = false;
      this._loadingOdds = false;
      this.emit({ type: "status", status: { ...this.status } });
    }
  }

  async loadMatchSnapshot(match) {
    const stageIds = Core.stageIdsForBo(match.bo || 1);
    const stages = [];
    let totalMarkets = 0;
    let error = null;
    const gameCode = getGameCodeForPlatformId("OB", match.gameId) || "unknown";

    for (const stageId of stageIds) {
      try {
        const view = await fetchGameView(this.session, match.matchId, stageId);
        const baseline = Core.buildOddsBaseline(view.markets);
        Object.assign(this.odds, baseline);
        totalMarkets += view.markets.length;

        const winMarket = Core.pickWinMarket(view.markets, stageId, undefined, gameCode);
        const homeOdd = winMarket?.odds.find((o) => o.side === "home");
        const awayOdd = winMarket?.odds.find((o) => o.side === "away");

        stages.push({
          stageId,
          label: stageId === 0 ? "全场" : `地图${stageId}`,
          winHome: homeOdd?.odd ?? null,
          winAway: awayOdd?.odd ?? null,
          winHomeId: homeOdd?.oddsId ?? null,
          winAwayId: awayOdd?.oddsId ?? null,
          winMarketId: winMarket?.marketId ?? null,
          winLocked: Boolean(winMarket?.locked),
          winMarketStatus: winMarket?.marketStatus ?? null,
          winMarket: winMarket?.marketName ?? "",
          winOddTypeId: winMarket?.oddTypeId ?? "",
          marketCount: view.markets.length,
        });
      } catch (err) {
        error = err.message;
        stages.push({
          stageId,
          label: stageId === 0 ? "全场" : `地图${stageId}`,
          winHome: null,
          winAway: null,
          winLocked: true,
          error: err.message,
        });
      }
      await sleep(this.stageDelayMs);
    }

    const overall = stages.find((s) => s.stageId === 0) || stages[0] || {};
    const detail = {
      stages,
      winHome: overall.winHome ?? null,
      winAway: overall.winAway ?? null,
      winHomeId: overall.winHomeId ?? null,
      winAwayId: overall.winAwayId ?? null,
      winLocked: overall.winLocked ?? true,
      winMarketStatus: overall.winMarketStatus ?? null,
      winMarket: overall.winMarket ?? "",
      marketCount: totalMarkets,
      updatedAt: Date.now(),
      error,
    };
    Core.refreshStageStatuses(detail, match, this.liveTimers[match.matchId]);
    attachObMatchBetRefs(detail, match.matchId, gameCode);
    this.byMatch[match.matchId] = detail;
  }

  async refreshLiveTimers() {
    if (!this.session) return;
    try {
      const { timers } = await fetchGetTimer(this.session);
      this.liveTimers = timers || {};
    } catch {
      /* getTimer 可选 */
    }
  }

  applyMqttChanges(changes, receivedAt) {
    let touched = false;
    for (const change of changes) {
      if (change.type === "oddsUpdate") {
        const row = this.odds[change.oddsId];
        if (!row) continue;
        const match = this.matches.find((m) => m.matchId === row.matchId);
        const detail = this.byMatch[row.matchId];
        if (detail) {
          applyOddsChange(detail, change);
          detail.updatedAt = receivedAt;
          Core.refreshStageStatuses(detail, match, this.liveTimers[row.matchId]);
        }
        this.emit({
          type: "oddsUpdate",
          matchId: row.matchId,
          oddsId: change.oddsId,
          odd: change.odd,
          prev: change.prev,
          marketName: row.marketName,
        });
        touched = true;
      } else if (Core.isMqttLockChange(change.type)) {
        const marketId = change.marketId;
        const oddsId = change.oddsId;
        for (const match of this.matches) {
          const detail = this.byMatch[match.matchId];
          if (!detail) continue;
          if (marketId) {
            applyMarketLock(detail, this.odds, change);
          } else if (oddsId && detail.stages) {
            for (const stage of detail.stages) {
              if (stage.winHomeId === oddsId || stage.winAwayId === oddsId) {
                stage.winLocked = change.locked;
              }
            }
          }
          detail.updatedAt = receivedAt;
          Core.refreshStageStatuses(detail, match, this.liveTimers[match.matchId]);
        }
        this.emit({ type: "marketLock", ...change });
        touched = true;
      }
    }
    return touched;
  }

  connectMqtt() {
    const url = this.session?.mqtt || this.session?.mqttEndpoints?.[0];
    if (!url) return;

    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }

    this.mqttClient = mqtt.connect(url, {
      clientId: `mqttjs_ob_web_${Date.now()}`,
      username: this.session.token,
      protocolId: "MQTT",
      protocolVersion: 4,
      reconnectPeriod: 5000,
      keepalive: 60,
    });

    this.mqttClient.on("connect", () => {
      this.status.mqtt = true;
      this.status.error = null;
      this.resubscribeAll();
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    });

    this.mqttClient.on("message", (topic, buf) => {
      let payload;
      try {
        payload = JSON.parse(buf.toString());
      } catch {
        return;
      }

      const topicInfo = Core.parseMqttTopic(topic);
      const state = { currentOdds: this.odds };
      const changes = Core.applyMqttPayload(state, topicInfo, payload, Date.now());
      if (!changes.length) return;

      if (this.applyMqttChanges(changes, Date.now())) {
        this.emit({ type: "snapshot", data: this.getSnapshot() });
      }
    });

    this.mqttClient.on("error", (err) => this.setError(err));
    this.mqttClient.on("close", () => {
      this.status.mqtt = false;
      this.emit({ type: "snapshot", data: this.getSnapshot() });
    });
  }

  resubscribeAll() {
    if (!this.mqttClient || !this.status.mqtt) return;
    for (const match of this.matches) {
      if (this.subscribedMatchIds.has(match.matchId)) continue;
      const topics = Core.mqttTopicsForMatch(match.matchId);
      this.mqttClient.subscribe(topics);
      this.subscribedMatchIds.add(match.matchId);
    }
  }
}

module.exports = { ObFeed };
