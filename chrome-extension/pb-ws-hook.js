/**
 * MAIN world：挂接官网已有 sports-websocket（不新建第二条）；
 * HTTP 只读 SPA 自己的 euro/odds / compact/events 响应，禁止另拉。
 * 原则：观测失败也不能影响官网收发（PONG / 订阅必须照常）。
 */
(function pbWsHookMain() {
  if (window.__CM_PB_WS_HOOK__) return;
  window.__CM_PB_WS_HOOK__ = true;

  const SOURCE = "cm-pb-ws";
  const EXPECTED = ["ODDS", "LEFT_MENU"];
  const OPTIONAL = ["SPECIAL_ODDS", "FAVOURITE_EVENTS", "TOURNAMENT_ODDS", "LIVE_SCORE", "CAROUSEL"];

  let enabled = true;
  let frameCount = 0;
  let lastPostAt = 0;
  /** 板序号：storage 合并时丢掉过期快照 */
  let boardSeq = 0;
  /** @type {WeakSet<WebSocket>} */
  const attached = new WeakSet();
  /** @type {WebSocket | null} */
  let lastSports = null;

  /** @type {Set<string>} */
  const subscribedOut = new Set();
  /** @type {Set<string>} */
  const inboundDest = new Set();
  /** @type {Record<string, number>} */
  const inboundTypeCount = {};
  /** @type {Map<number, {home:string, away:string, rotNum:string, league:string, startTime:number}>} */
  const eventNames = new Map();
  /** eventId → 首次进板时间（裁剪用）；展示排序改用开赛 startTime */
  const eventFirstSeenAt = new Map();
  /** @type {Map<string, object>} key=eventId|period|betType */
  const oddsBoard = new Map();

  const BET = { 1: "独赢", 2: "让分", 3: "大小" };
  const SEL = { 0: "主", 1: "客", 2: "和", 3: "大", 4: "小" };
  /** sport12：0=比赛全场；1–10=地图胜负（官方 odds/periods） */
  const MATCH_MAP_PERIODS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const PERIOD_LABEL = {
    0: "全场",
    1: "地图1",
    2: "地图2",
    3: "地图3",
    4: "地图4",
    5: "地图5",
    6: "地图6",
    7: "地图7",
    8: "地图8",
    9: "地图9",
    10: "地图10",
  };

  /** 默认只显示全程/地图独赢；可由 content 发 cmd 改 */
  let filterMatchMapMl = true;

  const SS_KEY = "cm-pb-ws-status";

  function post(payload) {
    try {
      window.postMessage({ source: SOURCE, ...payload }, "*");
    } catch {
      /* ignore */
    }
    try {
      if (payload && payload.kind === "status") {
        sessionStorage.setItem(SS_KEY, JSON.stringify({
          at: Date.now(),
          connected: payload.connected,
          readyState: payload.readyState,
          phase: payload.phase,
          socketSeen: payload.socketSeen,
          frameCount: payload.frameCount,
          lastType: payload.lastType,
          lastDestination: payload.lastDestination,
          subscribedOut: payload.subscribedOut,
          inboundDest: payload.inboundDest,
          checklist: payload.checklist,
          latestOdds: payload.latestOdds,
          vssid: payload.vssid,
          filterMatchMapMl: payload.filterMatchMapMl,
        }));
      }
    } catch {
      /* quota / private mode */
    }
  }

  function snapshotSubs() {
    return {
      subscribedOut: [...subscribedOut],
      inboundDest: [...inboundDest],
      inboundTypeCount: { ...inboundTypeCount },
      expected: EXPECTED,
      optional: OPTIONAL,
      checklist: {
        required: EXPECTED.map((d) => ({
          destination: d,
          out: subscribedOut.has(d),
          inbound: inboundDest.has(d),
          ok: subscribedOut.has(d) || inboundDest.has(d),
        })),
        optional: OPTIONAL.map((d) => ({
          destination: d,
          out: subscribedOut.has(d),
          inbound: inboundDest.has(d),
          seen: subscribedOut.has(d) || inboundDest.has(d),
        })),
      },
      latestOdds: boardSnapshot().map(slimBoardCard),
      boardSeq: (boardSeq += 1),
      filterMatchMapMl,
      ...debugSnap(),
    };
  }

  /** 影子只需这些字段；全卡 postMessage/storage 又大又慢，主站会读到过期板 */
  function slimBoardCard(card) {
    return {
      eventId: card.eventId,
      period: card.period,
      betType: card.betType,
      rotNum: card.rotNum || "",
      live: card.live === true,
      home: card.home,
      away: card.away,
      homeAlt: card.homeAlt,
      awayAlt: card.awayAlt,
      homePriceAt: card.homePriceAt,
      awayPriceAt: card.awayPriceAt,
      homeLocked: card.homeLocked,
      awayLocked: card.awayLocked,
    };
  }

  /**
   * 按场次聚合。侧栏与影子价共用：勿只留「最近几场」，
   * 否则主站 fo 有盘、WS 板却已挤掉 → 看不到 ws: 旁显。
   * 总量仍受 oddsBoard 上限（约 48 张卡）约束。
   */
  /**
   * @param {number} [maxCards] 按 event 新近度截断（裁剪用）；不传则全量且稳定排序（侧栏）
   */
  function boardSnapshot(maxCards) {
    /** @type {Map<string, {eventId:string, updatedAt:number, firstSeenAt:number, startTime:number, cards:object[]}>} */
    const byEvent = new Map();
    for (const card of oddsBoard.values()) {
      const eid = String(card.eventId ?? "");
      let g = byEvent.get(eid);
      if (!g) {
        const first =
          Number(eventFirstSeenAt.get(eid))
          || Number(card.firstSeenAt)
          || Number(card.updatedAt)
          || 0;
        g = {
          eventId: eid,
          updatedAt: 0,
          firstSeenAt: first,
          startTime: Number(card.startTime) || 0,
          cards: [],
        };
        byEvent.set(eid, g);
      }
      g.cards.push(card);
      g.updatedAt = Math.max(g.updatedAt, card.updatedAt || 0);
      if (card.firstSeenAt && (!g.firstSeenAt || card.firstSeenAt < g.firstSeenAt)) {
        g.firstSeenAt = card.firstSeenAt;
      }
      if (card.startTime && (!g.startTime || card.startTime < g.startTime)) {
        g.startTime = card.startTime;
      }
    }
    const groups = [...byEvent.values()];
    const sortPeriods = (g) =>
      g.cards.slice().sort((a, b) => (a.period ?? 0) - (b.period ?? 0));

    // 全量：按开赛时间升序（未知开赛时间靠后）
    if (maxCards == null || !(maxCards > 0)) {
      groups.sort(
        (a, b) =>
          (a.startTime || Number.MAX_SAFE_INTEGER) - (b.startTime || Number.MAX_SAFE_INTEGER)
          || (a.firstSeenAt || 0) - (b.firstSeenAt || 0)
          || String(a.eventId).localeCompare(String(b.eventId)),
      );
      return groups.flatMap(sortPeriods);
    }
    // 裁剪：仍按最近更新保留容量
    groups.sort((a, b) => b.updatedAt - a.updatedAt);
    /** @type {object[]} */
    const out = [];
    for (const g of groups) {
      const sorted = sortPeriods(g);
      if (out.length > 0 && out.length + sorted.length > maxCards) break;
      out.push(...sorted);
      if (out.length >= maxCards) break;
    }
    return out;
  }

  /** @type {WebSocket[]} */
  const sportsSockets = [];

  function rememberSports(ws) {
    if (!ws || sportsSockets.includes(ws)) return;
    sportsSockets.push(ws);
  }

  function pruneSports() {
    for (let i = sportsSockets.length - 1; i >= 0; i--) {
      const ws = sportsSockets[i];
      if (!ws || typeof ws.readyState !== "number" || ws.readyState === 3)
        sportsSockets.splice(i, 1);
    }
  }

  function liveSports() {
    pruneSports();
    return sportsSockets.find((ws) => ws.readyState === 1) || null;
  }

  /** 节流：普通 status；赔率板另走 scheduleBoardFlush（更勤） */
  function postStatusThrottled(extra, force) {
    const now = Date.now();
    if (!force && now - lastPostAt < 400) return;
    lastPostAt = now;
    const live = liveSports();
    const rest = extra && typeof extra === "object" ? { ...extra } : {};
    const explicitConnected = rest.connected === true;
    delete rest.connected;
    const socketSeen = sportsSockets.length > 0;
    const open = (live != null && Number(live.readyState) === 1) || explicitConnected;
    /** 无 sports WS 的 frame（常见：顶栏只拦 euro/odds）不得报 connected:false，否则盖掉真正挂 WS 的 iframe */
    const payload = {
      kind: "status",
      socketSeen,
      readyState: live != null ? live.readyState : (open ? 1 : undefined),
      frameCount,
      host: location.hostname,
      phase: "hooked",
      ...snapshotSubs(),
      ...rest,
    };
    if (open) payload.connected = true;
    else if (socketSeen || rest.phase === "ws_closed" || rest.phase === "hook_stop") {
      payload.connected = false;
      if (rest.phase === "ws_closed" || rest.phase === "hook_stop") payload.socketSeen = true;
    }
    post(payload);
  }

  let boardFlushTimer = null;
  /** WS / 页内 euro 后立刻刷给主站影子 */
  function scheduleBoardFlush() {
    if (!enabled) return;
    if (boardFlushTimer != null) return;
    boardFlushTimer = setTimeout(() => {
      boardFlushTimer = null;
      if (!enabled) return;
      postStatusThrottled({ phase: "hooked", boardFlush: true }, true);
    }, 0);
  }

  function isEuroOddsUrl(url) {
    return /\/sports-service\/sv\/euro\/odds/i.test(String(url || ""));
  }

  function isCompactEventsUrl(url) {
    return /\/sports-service\/sv\/compact\/events/i.test(String(url || ""));
  }

  /**
   * 只读官网自己发出的响应（与 SPA 同包）。禁止另拉 euro。
   * compact/events：只攒队名；euro/odds：有展示价才补丁写格。
   * 观测开关未开也要写板：SPA 首包 euro 往往早于 content 的 start，丢掉就会
   * 只剩后续 WS 残片（主价 1.238 对上 M2.100 那种错格）。
   */
  function ingestOfficialPageBody(url, text) {
    if (!isEuroOddsUrl(url) && !isCompactEventsUrl(url)) return;
    if (!text || typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("<")) return;
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return;
    }
    try {
      rememberEventNames(json);
      ingestEuroOddsNames(json);
      if (isEuroOddsUrl(url)) ingestEuroOddsPrices(json);
      refreshBoardMeta();
      scheduleBoardFlush();
    } catch {
      /* never break page */
    }
  }

  function isSportsUrl(url) {
    return /sports-websocket/i.test(String(url || ""));
  }

  /**
   * 线上 WS 可能给 string / Blob / ArrayBuffer。
   * 只要能解出文本就参与解析，避免“已连接但板为空”。
   * @param {unknown} data
   * @returns {Promise<string>}
   */
  async function wsDataToText(data) {
    if (typeof data === "string") return data;
    // Blob/ArrayBuffer 也是 typeof object：必须先解码，不能 JSON.stringify（会变成 "{}"）
    try {
      if (typeof Blob !== "undefined" && data instanceof Blob) {
        return await data.text();
      }
    } catch {
      /* ignore */
    }
    try {
      if (data instanceof ArrayBuffer) {
        return new TextDecoder().decode(data);
      }
      if (ArrayBuffer.isView(data)) {
        const view = data;
        return new TextDecoder().decode(
          view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
        );
      }
    } catch {
      /* ignore */
    }
    // 少数环境 ev.data 已是 JSON 对象
    if (data && typeof data === "object") {
      try {
        if (typeof data.type === "string") return JSON.stringify(data);
      } catch {
        /* ignore */
      }
    }
    return "";
  }

  /** Debug counters：帮助定位 UPDATE_ODDS 为何不进入 board */
  let debugDecodeEmpty = 0;
  let debugDecodeErrors = 0;
  let debugJsonParseErrors = 0;
  let debugLastDataType = "";
  function debugSnap() {
    return {
      debugDecodeEmpty,
      debugDecodeErrors,
      debugJsonParseErrors,
      debugLastDataType,
    };
  }

  function noteInbound(type, destination) {
    if (destination) inboundDest.add(destination);
    if (type) inboundTypeCount[type] = (inboundTypeCount[type] || 0) + 1;
    if (type === "UPDATE_ODDS" || type === "FULL_ODDS") inboundDest.add("ODDS");
    if (type === "UPDATE_LEFT_MENU" || type === "FULL_LEFT_MENU" || type === "UPDATE_GROUPS_OUTRIGHT") {
      inboundDest.add("LEFT_MENU");
    }
  }

  function noteOutbound(type, destination) {
    if (type === "SUBSCRIBE" && destination) subscribedOut.add(destination);
    if (type === "UNSUBSCRIBE" && destination) subscribedOut.delete(destination);
  }

  /**
   * 从任意树（odds.l / LEFT_MENU 等）记 event 元数据。
   * 对阵：下标 1/2；rotNum：优先下标 25（文档）；联赛名：父节点 name。
   * 价格行 `u` 不带队名，必须靠后续带 `l` 的帧或菜单回填。
   */
  function rememberEventNames(root) {
    if (root == null || eventNames.size > 1200) return;

    function readRotNum(ev) {
      if (!Array.isArray(ev)) return "";
      // bundle/文档：25；compact 若偏移，在 20–30 扫一个像 rot 的短数字串
      const tryIdx = [25, 24, 26, 23, 27];
      for (const i of tryIdx) {
        if (ev.length <= i) continue;
        const raw = ev[i];
        if (raw == null || raw === "") continue;
        const s = String(raw).trim();
        if (/^\d{3,8}$/.test(s)) return s;
      }
      return "";
    }

    /** [A8/文档可证实] compact 树 ev[4] = 开赛 epoch ms */
    function readStartTime(ev) {
      if (!Array.isArray(ev) || ev.length <= 4) return 0;
      const t = Number(ev[4]);
      // 毫秒或秒
      if (Number.isFinite(t) && t > 1e12) return t;
      if (Number.isFinite(t) && t > 1e9) return t * 1000;
      return 0;
    }

    function asEventId(v) {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 1e9 ? n : 0;
    }

    function walk(node, depth, league) {
      if (!node || depth > 12) return;
      if (Array.isArray(node)) {
        const eid = asEventId(node[0]);
        if (
          eid &&
          typeof node[1] === "string" &&
          node[1].trim() &&
          typeof node[2] === "string" &&
          node[2].trim()
        ) {
          const home = node[1].trim();
          const away = node[2].trim();
          // 排除明显非对阵（过短代号且像状态码）
          if (home.length >= 1 && away.length >= 1) {
            const prev = eventNames.get(eid);
            const startTime = readStartTime(node) || prev?.startTime || 0;
            eventNames.set(eid, {
              home,
              away,
              rotNum: readRotNum(node) || prev?.rotNum || "",
              league: league || prev?.league || "",
              startTime,
            });
          }
        }
        let nextLeague = league || "";
        if (
          typeof node[0] === "number" &&
          node[0] <= 1e9 &&
          typeof node[1] === "string" &&
          Array.isArray(node[2])
        ) {
          nextLeague = node[1] || nextLeague;
        }
        const n = Math.min(node.length, 80);
        for (let i = 0; i < n; i++) walk(node[i], depth + 1, nextLeague);
        return;
      }
      if (typeof node === "object") {
        for (const k of Object.keys(node)) walk(node[k], depth + 1, league);
      }
    }
    walk(root, 0, "");
  }

  function metaFor(eventId) {
    const n = Number(eventId);
    return eventNames.get(n) || null;
  }

  /** 队名晚到时回填已有赔率卡 */
  function refreshBoardMeta() {
    for (const card of oddsBoard.values()) {
      applyEventMeta(card, metaFor(card.eventId));
    }
  }

  function applyEventMeta(card, names) {
    if (!names) return;
    card.match = `${names.home} vs ${names.away}`;
    card.homeName = names.home;
    card.awayName = names.away;
    if (names.rotNum) card.rotNum = names.rotNum;
    if (names.league) card.league = names.league;
    if (names.startTime) card.startTime = names.startTime;
  }

  function periodLabelFor(period, betType) {
    const base = PERIOD_LABEL[period] || `P${period}`;
    if (betType === 1) return base;
    return `${base}·${BET[betType] || `bt${betType}`}`;
  }

  function ingestEuroOddsNames(payload) {
    if (!payload || typeof payload !== "object") return 0;
    const root = /** @type {any} */ (payload);
    const leagues = Array.isArray(root.leagues)
      ? root.leagues
      : Array.isArray(root.data?.leagues)
        ? root.data.leagues
        : [];
    let n = 0;
    for (const league of leagues) {
      if (!league || typeof league !== "object") continue;
      const leagueName = String(league.name || league.gameName || "");
      for (const event of league.events || []) {
        if (!event || typeof event !== "object") continue;
        const eid = Number(event.id);
        if (!Number.isFinite(eid) || eid < 1e9) continue;
        const parts = Array.isArray(event.participants) ? event.participants : [];
        const home = parts.find((p) => p && p.type === "HOME");
        const away = parts.find((p) => p && p.type === "AWAY");
        if (!home || !away) continue;
        const homeName = String(home.name || home.englishName || "").trim();
        const awayName = String(away.name || away.englishName || "").trim();
        if (!homeName || !awayName) continue;
        if (/\(Kills\)/i.test(homeName) || /\(Kills\)/i.test(awayName)) continue;
        const rot = event.rotNum ?? event.RotNum;
        const rawTime = Number(event.time ?? event.startTime ?? 0);
        let startTime = 0;
        if (Number.isFinite(rawTime) && rawTime > 1e12) startTime = rawTime;
        else if (Number.isFinite(rawTime) && rawTime > 1e9) startTime = rawTime * 1000;
        const prev = eventNames.get(eid);
        eventNames.set(eid, {
          home: homeName,
          away: awayName,
          rotNum: rot != null && String(rot).trim() ? String(rot).trim() : prev?.rotNum || "",
          league: leagueName || prev?.league || "",
          startTime: startTime || prev?.startTime || 0,
        });
        n += 1;
      }
    }
    return n;
  }

  /**
   * 官网 HTTP 全量画格路径（euro/odds moneyLine）→ board。
   * [A8/官网可证实] shouldRenderOdds 看非空展示价；空价不擦旧字（同 updateOdds）。
   * 这是官网源，不是 changmen fo。
   */
  function ensureMlBoardCard(eventId, period, now) {
    const betType = 1;
    const key = `${eventId}|${period}|${betType}`;
    let card = oddsBoard.get(key);
    if (card) return card;
    const eidKey = String(eventId);
    if (!eventFirstSeenAt.has(eidKey)) eventFirstSeenAt.set(eidKey, now);
    const names = metaFor(eventId);
    card = {
      key,
      eventId,
      betType,
      rotNum: names?.rotNum || "",
      league: names?.league || "",
      startTime: names?.startTime || 0,
      period,
      periodLabel: periodLabelFor(period, betType),
      market: BET[betType] || `bt${betType}`,
      match: names ? `${names.home} vs ${names.away}` : `event ${eventId}`,
      homeName: names?.home || "主",
      awayName: names?.away || "客",
      live: false,
      home: null,
      away: null,
      homeLineId: null,
      awayLineId: null,
      homeLocked: false,
      awayLocked: false,
      homePriceAt: 0,
      awayPriceAt: 0,
      homeStatus: "",
      awayStatus: "",
      homeAlt: 0,
      awayAlt: 0,
      status: "",
      firstSeenAt: eventFirstSeenAt.get(eidKey) || now,
      updatedAt: now,
    };
    oddsBoard.set(key, card);
    return card;
  }

  /** @returns {string|null} 官网可展示价字符串；空则不改格（同 updateOdds） */
  function officialDisplayPrice(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim().replace(/,/g, "");
    if (!s) return null;
    const num = Number(s);
    if (!Number.isFinite(num) || !(num > 0)) return null;
    return s;
  }

  /**
   * 写板一侧。无 8s/来源优先窗：后到的官网写（WS 或 euro）覆盖先到的。
   * 空价不擦（[A8/官网可证实] updateOdds / shouldRenderOdds）。
   */
  function writeBoardSide(card, side, rawPrice, lineId, now) {
    const price = officialDisplayPrice(rawPrice);
    if (price == null) return false;
    if (side === "home") {
      if (lineId != null && lineId !== "") card.homeLineId = lineId;
      if (card.home !== price) card.homePriceAt = now;
      card.home = price;
      card.homeLocked = false;
      card.homeAlt = 0;
    } else {
      if (lineId != null && lineId !== "") card.awayLineId = lineId;
      if (card.away !== price) card.awayPriceAt = now;
      card.away = price;
      card.awayLocked = false;
      card.awayAlt = 0;
    }
    card.updatedAt = now;
    return true;
  }

  /**
   * WS `odds.l` 事件树独赢格 → 板。
   * [A8/官网可证实] updateCachedOdds：live 写 `l`；event[_18.periods=8][periodNum]
   * 的 `lt.marketLine1x2=0`；`_64`/`et`：awayTeam=0, homeTeam=1, id=3, alt=4。
   * 有展示价才写；alt=1 不进主盘槽。
   */
  function ingestOddsLMl(root, live) {
    if (root == null) return 0;
    const now = Date.now();
    let n = 0;

    function asEventId(v) {
      const num = typeof v === "number" ? v : Number(v);
      return Number.isFinite(num) && num > 1e9 ? num : 0;
    }

    function ingestEvent(ev) {
      if (!Array.isArray(ev)) return;
      const eid = asEventId(ev[0]);
      if (
        !eid
        || typeof ev[1] !== "string"
        || !ev[1].trim()
        || typeof ev[2] !== "string"
        || !ev[2].trim()
      ) {
        return;
      }
      const periods = ev[8];
      if (!periods || typeof periods !== "object") return;
      const keys = Array.isArray(periods)
        ? periods.map((_, i) => i)
        : Object.keys(periods);
      for (const key of keys) {
        const period = Number(key);
        if (!Number.isFinite(period) || !MATCH_MAP_PERIODS.has(period)) continue;
        const pobj = periods[key];
        if (!pobj) continue;
        const ml = pobj[0];
        if (!Array.isArray(ml) || ml.length < 2) continue;
        if (Number(ml[4]) === 1) continue;
        const card = ensureMlBoardCard(eid, period, now);
        applyEventMeta(card, metaFor(eid));
        if (live) card.live = true;
        const lineId = ml[3];
        if (writeBoardSide(card, "home", ml[1], lineId, now)) n += 1;
        if (writeBoardSide(card, "away", ml[0], lineId, now)) n += 1;
      }
    }

    function walk(node, depth) {
      if (!node || depth > 12) return;
      if (Array.isArray(node)) {
        ingestEvent(node);
        const lim = Math.min(node.length, 80);
        for (let i = 0; i < lim; i++) walk(node[i], depth + 1);
        return;
      }
      if (typeof node === "object") {
        for (const k of Object.keys(node)) walk(node[k], depth + 1);
      }
    }
    walk(root, 0);
    return n;
  }

  /**
   * SPA 自己的 euro/odds：有展示价才补丁覆盖。
   * 空价 / unavailable 不擦（同 updateOdds）。不删缺 period：
   * 页内请求可能带过滤，不是 hook 自拉的全量快照。
   */
  function ingestEuroOddsPrices(payload) {
    if (!payload || typeof payload !== "object") return 0;
    const root = /** @type {any} */ (payload);
    const leagues = Array.isArray(root.leagues)
      ? root.leagues
      : Array.isArray(root.data?.leagues)
        ? root.data.leagues
        : [];
    const now = Date.now();
    let n = 0;
    for (const league of leagues) {
      if (!league || typeof league !== "object") continue;
      for (const event of league.events || []) {
        if (!event || typeof event !== "object") continue;
        const eid = Number(event.id);
        if (!Number.isFinite(eid) || eid < 1e9) continue;
        const periods = event.periods && typeof event.periods === "object" ? event.periods : null;
        if (!periods) continue;
        for (const key of Object.keys(periods)) {
          const period = Number(key);
          if (!Number.isFinite(period) || !MATCH_MAP_PERIODS.has(period)) continue;
          const ml = periods[key] && periods[key].moneyLine;
          if (!ml || typeof ml !== "object") continue;
          if (ml.unavailable) continue;
          const card = ensureMlBoardCard(eid, period, now);
          applyEventMeta(card, metaFor(eid));
          const rot = event.rotNum ?? event.RotNum;
          if (rot != null && String(rot).trim()) card.rotNum = String(rot).trim();
          if (event.live === true || event.isLive === true) card.live = true;
          const lineId = ml.lineId;
          if (writeBoardSide(card, "home", ml.homePrice, lineId, now)) n += 1;
          if (writeBoardSide(card, "away", ml.awayPrice, lineId, now)) n += 1;
        }
      }
    }
    if (oddsBoard.size > 400) {
      const keep = new Set(boardSnapshot(400).map((c) => c.key));
      for (const k of [...oddsBoard.keys()]) {
        if (!keep.has(k)) oddsBoard.delete(k);
      }
    }
    return n;
  }

  function ingestUpdateOdds(odds) {
    if (!odds || typeof odds !== "object") return;
    try {
      if (odds.l) {
        rememberEventNames(odds.l);
        ingestOddsLMl(odds.l, odds.live === true);
        refreshBoardMeta();
      }
      const blocks = Array.isArray(odds.u) ? odds.u : [];
      const now = Date.now();
      for (const b of blocks) {
        // odds.u 元素：[sportId, updateRows, …]；电竞 sportId=12（同连接可能推足球 29）
        const sportId = b && b[0];
        if (sportId != null && Number(sportId) !== 12) continue;
        const rows = b && b[1];
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!Array.isArray(row) || row.length < 13) continue;
          if (typeof row[0] !== "number") continue;
          // [A8/官网可证实] 末两格：length-2=action，length-1=eventId（勿写死 11/12，防加长行错槽）
          const action = Number(row[row.length - 2]);
          const eventId = Number(row[row.length - 1]);
          // Ma.ODDS=0；非 0 是时钟/比分等，勿当 ML
          if (action !== 0) continue;
          if (!Number.isFinite(eventId) || eventId < 1e9) continue;
          const period = row[0];
          const betType = row[1];
          const selectionType = row[2];
          const hdp = row[3];
          // 侧栏只保留全场/地图独赢（period 0–10 + betType=1）
          if (!MATCH_MAP_PERIODS.has(period) || betType !== 1) continue;
          // 官网格 id 末段是 hdp；独赢主盘为 0/null。非 0 不是这格，勿盖 ML
          if (hdp != null && hdp !== "" && Number(hdp) !== 0) continue;
          // [A8/官网可证实] G.alt=isAltLine；主站 fo selectionId 的 isAlt 恒 0，alt 行勿盖主盘槽
          if (Number(row[8]) === 1) continue;
          // [A8/官网可证实] updateOdds：门控仅为 truthy oddFm；空 oddsFm 不擦旧字。
          const oddsFm = row[5];
          const status = row[10] == null ? "" : String(row[10]);
          const price = officialDisplayPrice(oddsFm);

          const names = metaFor(eventId);
          const key = `${eventId}|${period}|${betType}`;
          let card = oddsBoard.get(key);
          if (!card) {
            const eidKey = String(eventId);
            if (!eventFirstSeenAt.has(eidKey)) eventFirstSeenAt.set(eidKey, now);
            card = {
              key,
              eventId,
              betType,
              rotNum: names?.rotNum || "",
              league: names?.league || "",
              startTime: names?.startTime || 0,
              period,
              periodLabel: periodLabelFor(period, betType),
              market: BET[betType] || `bt${betType}`,
              match: names ? `${names.home} vs ${names.away}` : `event ${eventId}`,
              homeName: names?.home || "主",
              awayName: names?.away || "客",
              live: odds.live === true,
              home: null,
              away: null,
              homeLineId: null,
              awayLineId: null,
              homeLocked: false,
              awayLocked: false,
              /** 该侧价格字符串上次真正变化的时间（影子合并用，避免旧板反复盖掉较新 HTTP） */
              homePriceAt: 0,
              awayPriceAt: 0,
              homeStatus: "",
              awayStatus: "",
              homeAlt: 0,
              awayAlt: 0,
              status: "",
              firstSeenAt: eventFirstSeenAt.get(eidKey) || now,
              updatedAt: now,
            };
            oddsBoard.set(key, card);
          }
          applyEventMeta(card, names);
          card.live = card.live === true || odds.live === true;
          card.updatedAt = now;
          card.status = status || card.status;
          if (selectionType === 0) {
            card.homeStatus = status;
            if (writeBoardSide(card, "home", price, row[6], now)) {
              /* ok */
            }
          } else if (selectionType === 1) {
            card.awayStatus = status;
            if (writeBoardSide(card, "away", price, row[6], now)) {
              /* ok */
            }
          }
        }
      }
      // HTTP 全量可多场；WS 增量也保留足够卡
      if (oddsBoard.size > 400) {
        const keep = new Set(boardSnapshot(400).map((c) => c.key));
        for (const k of [...oddsBoard.keys()]) {
          if (!keep.has(k)) oddsBoard.delete(k);
        }
      }
    } catch {
      /* never break page */
    }
  }

  /**
   * @param {WebSocket} ws
   * @param {string} via
   */
  function attach(ws, via) {
    if (!ws || attached.has(ws)) return;
    if (typeof ws.readyState === "number" && ws.readyState === 3) return;
    if (!isSportsUrl(ws.url)) return;
    attached.add(ws);
    rememberSports(ws);
    if (ws.readyState === 1) lastSports = ws;
    else if (!lastSports || lastSports.readyState !== 1) lastSports = ws;
    if (enabled) {
      postStatusThrottled({ phase: "hooked", via }, true);
    }

    ws.addEventListener("message", (ev) => {
      void handleWsMessage(ev);
    });

    ws.addEventListener("open", () => {
      rememberSports(ws);
      lastSports = ws;
      if (enabled) {
        postStatusThrottled({ phase: "connected", connected: true, via: `${via}_open` }, true);
      }
    });

    ws.addEventListener("close", (ev) => {
      if (!enabled) return;
      try {
        pruneSports();
        const official = pageSportsSocket();
        if ((official && Number(official.readyState) === 1) || liveSports()) {
          postStatusThrottled({ phase: "hooked", via: "peer_closed" }, true);
          return;
        }
        subscribedOut.clear();
        // 握手失败（从未 OPEN）不要钉死 ws_closed，心跳会按 __WS_INSTANCE__.current 重报
        if (Number(ev.target && ev.target.readyState) === 3 && !liveSports()) {
          postStatusThrottled({
            phase: "hooked",
            via: "closed",
            lastClose: { code: ev.code, reason: String(ev.reason || ""), wasClean: !!ev.wasClean },
          }, true);
        }
      } catch {
        /* ignore */
      }
    });
  }

  function handleWsMessage(ev) {
    void (async () => {
      try {
        debugLastDataType = ev.data == null ? "null" : String(ev.data.constructor && ev.data.constructor.name || typeof ev.data);
        const raw = await wsDataToText(ev.data);
        if (!raw) {
          debugDecodeEmpty += 1;
          if (enabled) postStatusThrottled({});
          return;
        }
        let j;
        try {
          j = JSON.parse(raw);
        } catch {
          debugJsonParseErrors += 1;
          if (enabled) postStatusThrottled({ ...debugSnap() }, true);
          return;
        }
        const type = j.type || "";
        const destination = j.destination || "";

        try {
          if (type === "UPDATE_ODDS" || type === "FULL_ODDS") {
            if (j.odds?.l) rememberEventNames(j.odds.l);
          }
          if (/LEFT_MENU/i.test(type) || destination === "LEFT_MENU") {
            rememberEventNames(j);
          }
        } catch {
          /* ignore name harvest */
        }

        const isOdds = type === "UPDATE_ODDS" || type === "FULL_ODDS";
        if (isOdds) ingestUpdateOdds(j.odds);

        if (!enabled) return;

        frameCount += 1;
        noteInbound(type, destination);
        if (isOdds) scheduleBoardFlush();
        if (/LEFT_MENU/i.test(type) || destination === "LEFT_MENU") {
          refreshBoardMeta();
        }
        // 能解出帧即这条 sports WS 是活的；勿再用 lastSports 包装对象的 readyState 误报断开
        if (type === "CONNECTED") {
          postStatusThrottled({
            phase: "connected",
            connected: true,
            vssid: typeof j.vssid === "string" ? j.vssid : "",
            lastType: type,
            lastDestination: destination,
          }, true);
          return;
        }
        postStatusThrottled({
          connected: true,
          lastType: type,
          lastDestination: destination,
        });
      } catch {
        debugDecodeErrors += 1;
        if (enabled) postStatusThrottled({});
      }
    })();
  }

  function noteOutboundPayload(data) {
    try {
      const raw = typeof data === "string"
        ? data
        : (data && typeof data === "object" && typeof data.type === "string"
          ? JSON.stringify(data)
          : "");
      if (!raw) return;
      const j = JSON.parse(raw);
      noteOutbound(j.type || "", j.destination || "");
      if (j.type === "SUBSCRIBE" || j.type === "UNSUBSCRIBE") {
        postStatusThrottled({ lastType: j.type, lastDestination: j.destination }, true);
      }
    } catch {
      /* ignore */
    }
  }

  function tryAttachExisting() {
    try {
      const ref = window.__WS_INSTANCE__;
      const cand =
        ref && typeof ref.readyState === "number" && typeof ref.send === "function"
          ? ref
          : ref && ref.current && typeof ref.current.readyState === "number" && typeof ref.current.send === "function"
            ? ref.current
            : null;
      if (cand) attach(cand, "existing");
    } catch {
      /* ignore */
    }
  }

  const NativeWS = window.WebSocket;
  const nativeAdd = NativeWS.prototype.addEventListener;
  NativeWS.prototype.addEventListener = function cmPbNativeAdd(type, fn, opt) {
    try {
      if (isSportsUrl(this.url)) attach(this, "addEventListener");
    } catch {
      /* ignore */
    }
    return nativeAdd.call(this, type, fn, opt);
  };
  const nativeSend = NativeWS.prototype.send;
  NativeWS.prototype.send = function cmPbNativeSend(data) {
    try {
      if (isSportsUrl(this.url)) {
        attach(this, "send");
        if (enabled) {
          frameCount += 1;
          noteOutboundPayload(data);
        }
      }
    } catch {
      /* ignore */
    }
    return nativeSend.call(this, data);
  };
  try {
    const onmsg = Object.getOwnPropertyDescriptor(NativeWS.prototype, "onmessage");
    if (onmsg && onmsg.set && onmsg.get) {
      Object.defineProperty(NativeWS.prototype, "onmessage", {
        configurable: true,
        enumerable: onmsg.enumerable,
        get() {
          return onmsg.get.call(this);
        },
        set(fn) {
          try {
            if (isSportsUrl(this.url)) attach(this, "onmessage");
          } catch {
            /* ignore */
          }
          return onmsg.set.call(this, fn);
        },
      });
    }
  } catch {
    /* ignore */
  }
  // 不替换 window.WebSocket：react-use-websocket 用 instanceof WebSocket；
  // 包一层会让官网握手失败并降级 HTTP（侧栏 rs=3、帧=0、盘>0）。
  // 挂接只走 prototype.send / onmessage / addEventListener。

  const nativeFetch = window.fetch.bind(window);
  function requestUrlOf(input) {
    if (typeof input === "string") return input;
    try {
      if (input && typeof input === "object") {
        if (typeof input.url === "string") return input.url;
        if (typeof input.href === "string") return input.href;
      }
    } catch {
      /* ignore */
    }
    return "";
  }
  window.fetch = function cmPbFetch(input, init) {
    const reqUrl = requestUrlOf(input);
    const p = nativeFetch(input, init);
    p.then((res) => {
      try {
        const u = reqUrl || res.url || "";
        if (!isEuroOddsUrl(u) && !isCompactEventsUrl(u)) return;
        const clone = res.clone();
        clone.text().then((text) => ingestOfficialPageBody(u, text)).catch(() => {});
      } catch {
        /* ignore */
      }
    }).catch(() => {});
    return p;
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function cmPbXhrOpen(method, url, ...rest) {
    try {
      this.__cmPbUrl = url == null ? "" : String(url);
    } catch {
      this.__cmPbUrl = "";
    }
    return xhrOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function cmPbXhrSend(...args) {
    try {
      this.addEventListener("load", function cmPbXhrLoad() {
        try {
          const url = this.__cmPbUrl || this.responseURL || "";
          if (!isEuroOddsUrl(url) && !isCompactEventsUrl(url)) return;
          const typ = String(this.responseType || "");
          if (typ && typ !== "text" && typ !== "json" && typ !== "") return;
          ingestOfficialPageBody(url, String(this.responseText || ""));
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
    return xhrSend.apply(this, args);
  };

  let heartbeatTimer = null;
  function ensureHeartbeat() {
    if (heartbeatTimer != null) return;
    heartbeatTimer = setInterval(() => {
      if (!enabled) return;
      try {
        tryAttachExisting();
        const cur = window.__WS_INSTANCE__ && window.__WS_INSTANCE__.current;
        if (
          cur
          && typeof cur.readyState === "number"
          && cur.readyState !== 3
          && typeof cur.send === "function"
        ) {
          attach(cur, "heartbeat");
        }
        const live = liveSports();
        if (live && Number(live.readyState) === 1) {
          postStatusThrottled({ phase: "connected", connected: true, via: "heartbeat" }, true);
        }
      } catch {
        /* ignore */
      }
    }, 1000);
  }
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== SOURCE || data.kind !== "cmd") return;
    if (data.cmd === "start") {
      enabled = true;
      if (typeof data.filterMatchMapMl === "boolean") {
        filterMatchMapMl = data.filterMatchMapMl;
      }
      lastPostAt = 0;
      // 不清 frameCount / oddsBoard：start 晚于已挂接的 CONNECTED / UPDATE_ODDS。
      refreshBoardMeta();
      tryAttachExisting();
      if (lastSports) attach(lastSports, "existing");
      const live = liveSports();
      if (live && Number(live.readyState) === 1) {
        postStatusThrottled({ phase: "connected", connected: true, via: "start" }, true);
      } else {
        postStatusThrottled({ phase: "hook_start" }, true);
      }
      ensureHeartbeat();
      return;
    }
    if (data.cmd === "stop") {
      enabled = false;
      oddsBoard.clear();
      post({
        kind: "status",
        phase: "hook_stop",
        connected: false,
        running: false,
        latestOdds: [],
        subscribedOut: [],
        inboundDest: [],
        inboundTypeCount: {},
      });
    }
    if (data.cmd === "setFilter") {
      filterMatchMapMl = data.filterMatchMapMl !== false;
      postStatusThrottled({ phase: "hooked" }, true);
    }
  });

  // 页面已建连时尽早挂上，关观测也攒队名
  tryAttachExisting();
  ensureHeartbeat();
})();
