/**
 * PB 观测板跨 frame 合并：sports-websocket 增量优先，euro/odds HTTP 只填空缺。
 * 顶栏 iframe 常只有 HTTP 快照；真正的 UPDATE_ODDS 在另一个 frame。
 */

/**
 * 套接字是否仍开着（不含 lastType 残留，避免断开后仍被当成 live）。
 * @param {object | null | undefined} s
 * @returns {boolean}
 */
export function isPbWsSocketOpen(s) {
  if (!s || typeof s !== "object") return false;
  if (s.phase === "ws_closed" || s.phase === "off" || s.phase === "hook_stop") return false;
  if (s.via === "closed") return false;
  if (Number(s.readyState) === 3) return false;
  return s.connected === true || Number(s.readyState) === 1 || s.phase === "connected";
}

/**
 * 本 frame 是否还在收 sports-websocket 帧（含 lastType，供 BoardGet）。
 * @param {object | null | undefined} s
 * @returns {boolean}
 */
export function isPbWsObserveLive(s) {
  if (!s || typeof s !== "object") return false;
  if (s.phase === "ws_closed" || s.phase === "off" || s.phase === "hook_stop") return false;
  if (s.via === "closed") return false;
  if (Number(s.readyState) === 3) return false;
  if (isPbWsSocketOpen(s)) return true;
  const t = String(s.lastType || "");
  return Number(s.frameCount) > 0 && /^(CONNECTED|PING|PONG|UPDATE_|FULL_)/.test(t);
}

/**
 * @param {object} card
 * @returns {string}
 */
export function pbWsBoardCardKey(card) {
  return `${card?.eventId}|${card?.period}|${card?.betType ?? 1}`;
}

function cardVia(card) {
  return card?.via === "ws" ? "ws" : "http";
}

function cardStamp(card) {
  return Math.max(
    Number(card?.homePriceAt) || 0,
    Number(card?.awayPriceAt) || 0,
    Number(card?.updatedAt) || 0,
  );
}

function hasPrice(value) {
  return value != null && String(value).trim() !== "";
}

/** WS 增量常常只带一侧；空侧保留已有价，避免把 euro 另一侧抹掉 */
function mergeCardSides(prev, incoming, via) {
  const next = { ...prev, ...incoming, via };
  if (!hasPrice(incoming.home) && hasPrice(prev.home)) {
    next.home = prev.home;
    if (prev.homePriceAt != null) next.homePriceAt = prev.homePriceAt;
    if (prev.homeAlt != null) next.homeAlt = prev.homeAlt;
    if (prev.homeLocked != null) next.homeLocked = prev.homeLocked;
  }
  if (!hasPrice(incoming.away) && hasPrice(prev.away)) {
    next.away = prev.away;
    if (prev.awayPriceAt != null) next.awayPriceAt = prev.awayPriceAt;
    if (prev.awayAlt != null) next.awayAlt = prev.awayAlt;
    if (prev.awayLocked != null) next.awayLocked = prev.awayLocked;
  }
  return next;
}

const BOARD_MAX = 400;

function trimMergedBoard(cards) {
  if (cards.length <= BOARD_MAX) return cards;
  const ws = cards.filter((c) => cardVia(c) === "ws").sort((a, b) => cardStamp(b) - cardStamp(a));
  const http = cards.filter((c) => cardVia(c) !== "ws").sort((a, b) => cardStamp(b) - cardStamp(a));
  if (ws.length >= BOARD_MAX) return ws.slice(0, BOARD_MAX);
  return [...ws, ...http.slice(0, BOARD_MAX - ws.length)];
}

/**
 * @param {object[] | null | undefined} curCards
 * @param {object[] | null | undefined} incomingCards
 * @param {boolean} incomingLive 来自已连上 sports-websocket 的 frame
 * @param {boolean} [httpMayReplaceWs] WS 已不在时允许 euro 覆盖旧 WS 卡
 * @returns {object[]}
 */
export function mergePbWsBoards(curCards, incomingCards, incomingLive, httpMayReplaceWs) {
  const map = new Map();
  for (const card of Array.isArray(curCards) ? curCards : []) {
    if (!card || card.eventId == null) continue;
    map.set(pbWsBoardCardKey(card), card);
  }
  for (const card of Array.isArray(incomingCards) ? incomingCards : []) {
    if (!card || card.eventId == null) continue;
    const key = pbWsBoardCardKey(card);
    const prev = map.get(key);
    const incWs = incomingLive === true || cardVia(card) === "ws";
    if (!prev) {
      map.set(key, incWs ? { ...card, via: "ws" } : card);
      continue;
    }
    if (incWs) {
      if (cardVia(prev) !== "ws" || cardStamp(card) >= cardStamp(prev))
        map.set(key, mergeCardSides(prev, card, "ws"));
      continue;
    }
    if (cardVia(prev) === "ws" && httpMayReplaceWs !== true) continue;
    map.set(key, mergeCardSides(prev, card, "http"));
  }
  return trimMergedBoard([...map.values()]);
}
