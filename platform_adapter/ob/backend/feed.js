"use strict";

/**
 * OB 平台 — 后端本地 Feed 采集器（ObFeed）
 *
 * 【是什么】
 * 这是 changmen 后端用来从 OB 场馆拉取赛事/盘口并维护内存快照的脚本，不是前端浏览器里的采集器。
 * 在 server 启动时由 FeedHub（shared/platform_registry.js）按 ENABLE_OB 注册并实例化；
 * 采集结果经 esport-bridge 写入 data/esport/matches.json、client_matchs.json 等，供
 * Client_GetMatchs / 前端 /feed/ 调试页使用。
 *
 * 【与 A8 前端 UMe 的关系】
 * A8 index.js 里 UMe 插件：浏览器内 game/index → saveMatch + game/view → saveBets + MQTT。
 * changmen 拆成两层：
 *   - 本文件（后端）：列表范围更广（多组 flag/day）、灌全场胜负盘摘要 + MQTT 增量；
 *   - collectors/ob（前端）：主要 saveBets + fo 内存，列表默认不写（依赖本 Feed）。
 *
 * 【采集链路概览】
 *   start() → 每 indexIntervalMs（默认 30s）sync()
 *     → resolveObSession() 取 gateway/token/mqtt
 *     → fetchMatchList() 多源 game/index 合并
 *     → refreshLiveTimers() game/getTimer
 *     → loadAllOddsInBackground() 逐场 game/view 拉盘口
 *     → connectMqtt() + resubscribeAll() MQTT 增量改赔率/锁盘
 *   每次变更 emit({ type: "snapshot" | "oddsUpdate" | ... }) 给 FeedHub / Dashboard。
 *
 * 【依赖模块】
 *   ob_core.js    — 解析 index/view、MQTT topic、盘口锁盘规则（对齐 A8）
 *   ob_session.js   — HTTP：obGet / fetchGameView / fetchGetTimer
 *   platform_sync   — resolveObSession：token、网关、MQTT 地址
 */

const { backendRequire } = require("./_require.js");
const mqtt = backendRequire("mqtt");
const Core = require("./core.js");
const { describePlatformGame, getActivePlatformGameIds, getCatalogSummary, getGameCodeForPlatformId } = require("./_require.js").reqB("core/shared/game_catalog.js");
const { attachObMatchBetRefs } = require("./_require.js").reqB("core/shared/bet_ref.js");
const { obGet, fetchGameView, fetchGetTimer } = require("./session.js");
const { resolveObSession } = require("./_require.js").reqB("core/esport-api/platform_sync.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 联赛名：OB 接口常用 &nbsp; 实体，展示前替换为空格 */
function formatTournament(raw) {
  return String(raw || "").replace(/&nbsp;/g, " ").trim();
}

/**
 * 将 MQTT 单条赔率变更写回 byMatch 里某场的 stages / 全场胜负价。
 * oddsId 对应 game/view 里 @T1/@T2 的 odd id；stageId===0 时同步更新 detail 顶层 winHome/winAway。
 */
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

/**
 * 将 MQTT 锁盘/暂停类变更写回对应 market 下的 stage。
 * oddsIndex 来自 buildOddsBaseline，用于 oddsId → marketId 反查。
 */
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

/**
 * game/index 拉取源配置。
 * A8 前端 UMe 只用 flag=1&day=1（今日）；后端为覆盖「全部/明日/更远」多拉几组再按 matchId 去重。
 * 可通过构造 ObFeed({ indexSources: [...] }) 覆盖。
 * 环境变量 `OB_FEED_MODE=a8`：仅今日 index + stageDelay 1500ms（对齐 UMe，见 platform_registry）。
 */
const A8_INDEX_SOURCES = [{ flag: 1, day: 1, scope: "today" }];

const DEFAULT_INDEX_SOURCES = [
  { flag: 0, day: 0, scope: "all" },       // 全部
  ...A8_INDEX_SOURCES,                     // 今日（与 A8 一致）
  { flag: 2, day: 1, scope: "tomorrow" },  // 明日
  { flag: 2, day: 2, scope: "future" },
  { flag: 2, day: 3, scope: "future" },
];

class ObFeed {
  /**
   * @param {object} [options]
   * @param {Array<{flag:number,day:number,scope?:string}>} [options.indexSources] game/index 参数组
   * @param {string} [options.gameId="0"]  game_id 过滤（0=全部游戏）
   * @param {string[]} [options.allowedGameIds] 允许入库的游戏 id，默认 game_catalog 里 OB 启用项
   * @param {number} [options.indexIntervalMs=30000] 主 sync 定时器间隔（与 A8 30s 一致）
   * @param {number} [options.indexFetchDelayMs=650] 每组 index 请求之间的间隔，减轻限流
   * @param {number} [options.stageDelayMs=150] 每场每个 stage 的 game/view 间隔（A8 UMe 为 1500ms；`OB_FEED_MODE=a8` 时默认 1500）
   * @param {string} [options.feedMode="default"] 仅状态展示：`default` | `a8`
   */
  constructor(options = {}) {
    this.feedMode = options.feedMode || "default";
    this.indexSources = options.indexSources || DEFAULT_INDEX_SOURCES;
    this.gameId = options.gameId || "0";
    this.allowedGameIds = new Set(
      (options.allowedGameIds || getActivePlatformGameIds("OB")).map(String)
    );
    this.indexIntervalMs = options.indexIntervalMs || 30000;
    this.indexFetchDelayMs = options.indexFetchDelayMs || 650;
    this.stageDelayMs = options.stageDelayMs || 150;
    /** FeedHub / Dashboard 订阅的快照与事件 */
    this.listeners = new Set();
    /** resolveObSession 结果：gateway、token、lang、mqtt 等 */
    this.session = null;
    /** 当前赛事列表（normalizeGameIndex 后的结构） */
    this.matches = [];
    /** matchId → 该场盘口摘要（stages、胜负价、marketCount） */
    this.byMatch = {};
    /** oddsId → 单条赔率行（MQTT 增量索引） */
    this.odds = {};
    /** matchId → getTimer 返回的滚球计时信息 */
    this.liveTimers = {};
    this.mqttClient = null;
    /** 已 subscribe 的 source matchId，避免重复订 topic */
    this.subscribedMatchIds = new Set();
    /** 对外状态：/feed/ 页与 bridge 可读 */
    this.status = {
      running: false,
      syncing: false,
      mqtt: false,
      feedMode: this.feedMode,
      error: null,
      lastSync: null,
      matchCount: 0,
      loadingOdds: false,
    };
    this._syncing = false;
    this._loadingOdds = false;
    this._timers = [];
  }

  /** 注册事件监听；返回取消函数 */
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

  /**
   * 供 FeedHub / HTTP /feed/snapshot 使用的只读视图。
   * matches 数组合并了列表字段 + byMatch 里的盘口摘要。
   */
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

  /**
   * FeedHub 调用入口：启动定时 sync + 立即跑一轮。
   * 不会阻塞 server；MQTT 在首次 sync 内 connectMqtt。
   */
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

  /** 停止定时器并断开 MQTT */
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

  /**
   * 拉合并后的赛事列表。
   * 按 indexSources 顺序请求 game/index，matchId 首次出现为准；再按 allowedGameIds 过滤、按开赛时间排序。
   * token 失效时 json.status==="false"，记入 errors 并继续下一源。
   */
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

  /**
   * 主同步：刷新 session → 列表 → 计时器 → 触发后台灌盘。
   * _syncing 防止重入；灌盘在 loadAllOddsInBackground 异步进行，不阻塞下一轮 index 定时器。
   */
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

  /**
   * 后台逐场拉 game/view，更新 byMatch / odds。
   * 每 5 场 emit 一次 snapshot 便于 Dashboard 渐进刷新；结束后 resubscribeAll 订 MQTT。
   * 与 A8 不同：A8 在 index 循环内顺序 unsub→view→sub；此处 index 与 view 解耦，MQTT 在全部 view 后再统一订阅。
   */
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

  /**
   * 单场灌盘：按 BO 决定 stage 列表（BO1 仅全场 stage 0），每场请求 game/view。
   * 从 markets 里 pickWinMarket 取主客胜负；baseline 写入 this.odds 供 MQTT 反查。
   * attachObMatchBetRefs 写入下注用的 SourceBetID / SourceHomeID 等引用。
   */
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

  /**
   * 滚球计时：game/getTimer，失败静默（非关键路径）。
   * 结果用于 refreshStageStatuses 展示「进行中/第几局」等。
   */
  async refreshLiveTimers() {
    if (!this.session) return;
    try {
      const { timers } = await fetchGetTimer(this.session);
      this.liveTimers = timers || {};
    } catch {
      /* getTimer 可选 */
    }
  }

  /**
   * 把 ob_core.applyMqttPayload 解析出的变更应用到内存并 emit 细粒度事件。
   * @returns {boolean} 是否有字段被更新（用于决定是否 push 全量 snapshot）
   */
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

  /**
   * 连接 OB MQTT（地址来自 session.mqtt，通常为场馆侧 wss）。
   * 与 A8 UMe 差异：
   *   - A8 用固定 admin 账号 + clientId mqttjs_dj1250901313125773543，连 47.115.75.57 relay；
   *   - 后端直连 session 里的 mqtt，clientId 带时间戳避免冲突。
   * 前端浏览器采集走 server 的 /esport/ws/OB relay（ENABLE_OB_MQTT_RELAY，与 ObFeed 的 ENABLE_OB 无关）。
   */
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

  /**
   * 对当前 matches 里尚未订阅的 matchId 订阅 Core.mqttTopicsForMatch（与 A8 n9 同族的 odd/market topic）。
   * 新赛次在 loadAllOddsInBackground 结束后调用；旧 matchId 不会在此 unsubscribe（靠下次全量列表对比可扩展清理）。
   */
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

module.exports = { ObFeed, A8_INDEX_SOURCES, DEFAULT_INDEX_SOURCES };
