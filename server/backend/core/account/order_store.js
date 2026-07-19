import * as sb from "@changmen/db";
import {
  backendBindLinkFromCreateAt,
  isArbBindLink,
  placeholderLinkFromCreateAt,
} from "@changmen/db";
import { parseVenueCreateAt } from "@changmen/shared/time/match_time";
import { isAdminUser } from "../auth/admin_auth.js";

export function toDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** PM 卖单归账时间：对应买单 create_at（找不到则用卖单自身） */
function orderProfitDateTsFromRaw(row, peers) {
  const raw = row?.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
    ? row.raw
    : {};
  const provider = String(row?.provider || "").trim();
  const side = String(raw.pmSide || "").toLowerCase();
  if (provider === "Polymarket" && side === "sell") {
    const buyId = String(raw.pmBuyOrderId || "").trim().toLowerCase();
    if (buyId) {
      const buy = peers.find(p => String(p?.order_id || "").trim().toLowerCase() === buyId);
      const buyAt = Number(buy?.create_at) || 0;
      if (buyAt > 0)
        return buyAt;
    }
    const link = Number(row.link) || 0;
    const buyAts = peers
      .filter((p) => {
        const pr = p?.raw && typeof p.raw === "object" && !Array.isArray(p.raw) ? p.raw : {};
        return String(p?.provider || "").trim() === "Polymarket"
          && String(pr.pmSide || "").toLowerCase() !== "sell"
          && (link === 0 || (Number(p.link) || 0) === link);
      })
      .map(p => Number(p.create_at) || 0)
      .filter(n => n > 0);
    if (buyAts.length)
      return Math.min(...buyAts);
  }
  return Number(row?.create_at) || 0;
}

function filterRawOrdersBelongingToDate(rows, dateKey) {
  const list = rows || [];
  const byLink = new Map();
  for (const r of list) {
    const link = Number(r.link) || 0;
    if (!byLink.has(link))
      byLink.set(link, []);
    byLink.get(link).push(r);
  }
  const out = [];
  for (const group of byLink.values()) {
    const pmSells = group.filter((r) => {
      const raw = r?.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
      return String(r?.provider || "").trim() === "Polymarket"
        && String(raw.pmSide || "").toLowerCase() === "sell";
    });
    if (pmSells.length) {
      const anchors = pmSells
        .map(s => orderProfitDateTsFromRaw(s, group))
        .filter(n => n > 0);
      if (anchors.length) {
        const anchorDay = toDateKey(Math.min(...anchors));
        if (anchorDay !== dateKey)
          continue;
      }
      out.push(...group);
      continue;
    }
    out.push(...group);
  }
  return out;
}

function mapStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "win")
    return "Win";
  if (s === "lose")
    return "Lose";
  if (s === "reject")
    return "Reject";
  if (s === "return")
    return "Return";
  if (s === "pending")
    return "Pending";
  return "None";
}

function parseNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** pmShares = 官方 fill，取 RDS/CLOB/入参 最大值，避免 0 覆盖有效值 */
function preservePmBuyFillShares(prevRaw, o, merged) {
  const prev = parseNum(prevRaw.pmShares, 0);
  const fromOrder = parseNum(o.pmShares ?? o.PmShares, 0);
  const fromMerged = parseNum(merged.pmShares, 0);
  const fill = Math.max(prev, fromOrder, fromMerged);
  return fill > 0 ? fill : undefined;
}

/** pmFillPrice = CLOB trade.price；同步时优先用 API 刷新值 */
function preservePmFillPrice(prevRaw, o, merged) {
  const incoming = parseNum(o.pmFillPrice ?? o.PmFillPrice, 0);
  const fromMerged = parseNum(merged.pmFillPrice, 0);
  const prev = parseNum(prevRaw.pmFillPrice, 0);
  if (incoming > 0 && incoming < 1)
    return incoming;
  if (fromMerged > 0 && fromMerged < 1)
    return fromMerged;
  if (prev > 0 && prev < 1)
    return prev;
  return undefined;
}

/** order_id 大小写不敏感查找（PM 0x hex 偶发大小写不一致） */
function findOrderRowById(byOrderId, orderId) {
  const id = String(orderId ?? "").trim();
  if (!id)
    return undefined;
  const direct = byOrderId.get(id);
  if (direct)
    return direct;
  const needle = id.toLowerCase();
  for (const [key, row] of byOrderId) {
    if (String(key).toLowerCase() === needle)
      return row;
  }
  return undefined;
}

function findAssignedLink(assignedInBatch, orderId) {
  const id = String(orderId ?? "").trim();
  if (!id)
    return 0;
  const direct = parseNum(assignedInBatch.get(id), 0);
  if (direct !== 0)
    return direct;
  const needle = id.toLowerCase();
  for (const [key, link] of assignedInBatch) {
    if (String(key).toLowerCase() === needle) {
      const n = parseNum(link, 0);
      if (n !== 0)
        return n;
    }
  }
  return 0;
}

function resolveSaveOrderLink(o, prevRaw, orderId, createAt, linkByOrderId, existingByOrderId, assignedInBatch, provider) {
  const incomingSide = String(o.pmSide ?? prevRaw.pmSide ?? "").toLowerCase();
  const buyOrderId = String(o.pmBuyOrderId ?? prevRaw.pmBuyOrderId ?? "").trim();
  // PM 卖单：始终跟对应买单 Link（绑定修正时覆盖旧占位 link）
  if (provider === "Polymarket" && incomingSide === "sell" && buyOrderId) {
    const buyRow = findOrderRowById(existingByOrderId, buyOrderId);
    const buyLink = parseNum(buyRow?.link, 0) || findAssignedLink(assignedInBatch, buyOrderId);
    if (buyLink !== 0)
      return buyLink;
    // 买单尚未入库时：用客户端带上的买单 Link（跨日卖仍同组）
    const incomingBuyLink = parseNum(o.link ?? o.Link ?? o.LinkID, 0);
    if (incomingBuyLink !== 0)
      return incomingBuyLink;
  }

  const boundLink = Number(linkByOrderId.get(orderId)) || 0;
  // 已绑套利 Link：SaveOrder 同步不覆盖（Bind 确认后保持稳定）
  if (isArbBindLink(boundLink))
    return boundLink;

  // [changmen 扩展] 客户端拉单时附带最终 linkId，缩短 create_at-1 占位窗口
  const incomingLink = parseNum(o.link ?? o.Link ?? o.LinkID, 0);
  if (incomingLink !== 0)
    return incomingLink;

  if (boundLink !== 0)
    return boundLink;

  return backendBindLinkFromCreateAt(createAt);
}

function resolveStoredLink(link, _orderId, createAt) {
  const n = Number(link);
  if (Number.isFinite(n) && n !== 0)
    return n;
  return placeholderLinkFromCreateAt(createAt);
}

export { resolveStoredLink };

/** 工作台 Client_GetOrder / 管理端 mapAdminOrderRow 共用，勿分叉 */
export function rowToOrder(r) {
  const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
  let betMoney = r.bet_money || 0;
  let money = r.money || 0;
  // 卖单盈亏：新写入已为 0（记在买单）；旧数据 money 仍可能非 0，读出时勿清零
  return {
    OrderID: r.order_id,
    Link: resolveStoredLink(r.link, r.order_id, r.create_at),
    Type: r.provider || "",
    Match: r.match || "",
    Bet: r.bet || "",
    Item: r.item || "",
    Odds: r.odds || 0,
    BetMoney: betMoney,
    Money: money,
    Status: r.status || "None",
    CreateAt: r.create_at || 0,
    PlayerID: Number(r.player_id) || 0,
    Player: {
      Platform: r.provider || "",
      UserName: "",
      Status: r.status || "None",
    },
    PmTokenId: raw.pmTokenId ? String(raw.pmTokenId) : undefined,
    PmShares: parseNum(raw.pmShares, 0) || undefined,
    PmFillPrice: (() => {
      const price = parseNum(raw.pmFillPrice, 0);
      return price > 0 && price < 1 ? price : undefined;
    })(),
    PmStakeUsdc: parseNum(raw.pmStakeUsdc, 0) || undefined,
    PmConditionId: raw.pmConditionId ? String(raw.pmConditionId) : undefined,
    PmOrigin: raw.pmOrigin === "changmen" || raw.pmOrigin === "external"
      ? raw.pmOrigin
      : undefined,
    PmAttributedSellShares: parseNum(raw.pmAttributedSellShares, 0) || undefined,
    PmRealizedPnlUsdc: parseNum(raw.pmRealizedPnlUsdc, 0) || undefined,
    PmSellState: raw.pmSellState === "open"
      || raw.pmSellState === "partial"
      || raw.pmSellState === "closed"
      || raw.pmSellState === "settled"
      ? raw.pmSellState
      : undefined,
    PmSide: raw.pmSide === "buy" || raw.pmSide === "sell" ? raw.pmSide : undefined,
    PmBuyOrderId: raw.pmBuyOrderId ? String(raw.pmBuyOrderId) : undefined,
  };
}

/** @internal 单测 / 手动卖出本金合并 */
export function mergePolymarketLogicalSave(prevRow, prevRaw, o, pmOrigin) {
  const provider = String(o.provider || o.Type || "").trim();
  let merged = pmOrigin ? { ...o, pmOrigin } : { ...o };
  let money = parseNum(o.money ?? o.Money, 0);
  let bet_money = parseNum(o.betMoney ?? o.BetMoney, 0);

  if (provider !== "Polymarket")
    return { raw: merged, money, bet_money };

  const incomingSide = String(o.pmSide ?? prevRaw.pmSide ?? "buy").toLowerCase();
  const isSell = incomingSide === "sell";
  const isChangmen = pmOrigin === "changmen" || prevRaw.pmOrigin === "changmen";
  const prevBet = parseNum(prevRaw.betMoney, parseNum(prevRow?.bet_money, 0));
  const incomingBet = parseNum(o.betMoney ?? o.BetMoney, 0);

  merged.pmSide = isSell ? "sell" : "buy";

  if (isSell) {
    const proceedsBet = incomingBet > 0 ? incomingBet : (prevBet > 0 ? prevBet : 0);
    const prevMoney = parseNum(prevRaw.money ?? prevRow?.money, 0);
    const incomingMoney = parseNum(o.money ?? o.Money, 0);
    /**
     * 新模型：卖单 money 应为 0（盈亏在买单）。
     * 但客户端 sync 会带 money=0 覆盖；未迁移旧卖单若库内仍有盈亏，必须保留，否则日盈亏被清掉。
     */
    let sellMoney = 0;
    if (Math.abs(incomingMoney) > 1e-9)
      sellMoney = incomingMoney;
    else if (Math.abs(prevMoney) > 1e-9)
      sellMoney = prevMoney;

    if (isChangmen || prevRaw.pmOrigin === "changmen") {
      merged = {
        ...merged,
        pmSide: "sell",
        pmOrigin: "changmen",
        betMoney: incomingBet > 0 ? incomingBet : (prevBet > 0 ? prevBet : proceedsBet),
        pmBuyOrderId: prevRaw.pmBuyOrderId ?? merged.pmBuyOrderId ?? o.pmBuyOrderId,
        pmRealizedPnlUsdc: merged.pmRealizedPnlUsdc ?? o.pmRealizedPnlUsdc ?? prevRaw.pmRealizedPnlUsdc,
        money: sellMoney,
      };
      bet_money = parseNum(merged.betMoney, proceedsBet);
      money = sellMoney;
      merged.money = sellMoney;
      return { raw: merged, money, bet_money };
    }

    // 官网/CLOB 卖单
    merged = {
      ...merged,
      pmSide: "sell",
      pmOrigin: "external",
      pmBuyOrderId: merged.pmBuyOrderId ?? o.pmBuyOrderId ?? prevRaw.pmBuyOrderId,
      betMoney: incomingBet > 0 ? incomingBet : prevBet,
      pmStakeUsdc: parseNum(merged.pmStakeUsdc ?? o.pmStakeUsdc, parseNum(prevRaw.pmStakeUsdc, 0)),
      pmRealizedPnlUsdc: merged.pmRealizedPnlUsdc ?? o.pmRealizedPnlUsdc ?? prevRaw.pmRealizedPnlUsdc,
      money: sellMoney,
    };
    bet_money = parseNum(merged.betMoney, proceedsBet);
    money = sellMoney;
    return { raw: merged, money, bet_money };
  }

  const prevState = prevRaw.pmSellState;
  const prevAttr = parseNum(prevRaw.pmAttributedSellShares, 0);
  const incomingAttr = parseNum(o.pmAttributedSellShares ?? merged.pmAttributedSellShares, 0);
  const incomingState = o.pmSellState ?? merged.pmSellState;
  const incomingSellState = String(incomingState ?? "").toLowerCase();
  const hasBetMoneyField = Object.prototype.hasOwnProperty.call(o, "betMoney")
    || Object.prototype.hasOwnProperty.call(o, "BetMoney");
  /**
   * 原始投注本金（bet_money）卖出后不改写。
   * 剩余敞口只靠 pmStakeUsdc / pmAttributedSellShares / pmSellState。
   */
  const originalBet = prevBet > 0 ? prevBet : incomingBet;
  let betMoneyForMerge = originalBet;
  if (!prevBet && hasBetMoneyField && incomingBet > 0)
    betMoneyForMerge = incomingBet;

  const sellStateRank = (s) => {
    const v = String(s ?? "").toLowerCase();
    if (v === "settled")
      return 3;
    if (v === "closed")
      return 2;
    if (v === "partial")
      return 1;
    return 0;
  };

  /**
   * 已手动卖出归因：盈亏累加在买单 money；本金保持原始。
   */
  const hasManualSellProgress = prevState === "partial"
    || prevState === "closed"
    || (prevAttr > 0 && prevState === "settled");
  if (isChangmen && hasManualSellProgress) {
    const advanceAttr = incomingAttr > prevAttr + 1e-9;
    const advanceState = sellStateRank(incomingState) > sellStateRank(prevState);
    let nextState = advanceState || advanceAttr
      ? (incomingState ?? prevRaw.pmSellState)
      : (prevRaw.pmSellState ?? merged.pmSellState);
    if (String(nextState).toLowerCase() === "settled" && (prevState === "closed" || prevState === "partial"))
      nextState = prevState;
    const incomingMoney = parseNum(o.money ?? o.Money, 0);
    const prevMoney = parseNum(prevRaw.money ?? prevRow?.money, 0);
    // 客户端 patch 已含累计盈亏时用 incoming；否则保留 prev
    const nextMoney = incomingMoney !== 0 || Object.prototype.hasOwnProperty.call(o, "money")
      || Object.prototype.hasOwnProperty.call(o, "Money")
      ? incomingMoney
      : prevMoney;
    merged = {
      ...merged,
      pmSide: "buy",
      pmOrigin: "changmen",
      pmStakeUsdc: advanceAttr
        ? (merged.pmStakeUsdc ?? o.pmStakeUsdc ?? prevRaw.pmStakeUsdc)
        : (prevRaw.pmStakeUsdc ?? merged.pmStakeUsdc),
      betMoney: betMoneyForMerge,
      pmSellState: nextState,
      pmAttributedSellShares: advanceAttr
        ? incomingAttr
        : (prevRaw.pmAttributedSellShares ?? merged.pmAttributedSellShares),
      money: nextMoney,
      status: "none",
    };
    bet_money = betMoneyForMerge;
    money = nextMoney;
  }
  else {
    // 首次写入 partial/closed：允许更新 stake/attr/money；bet_money 仍保留原始
    const allowStakeUpdate = incomingSellState === "partial"
      || incomingSellState === "closed"
      || prevState === "partial"
      || prevState === "closed"
      || (prevState === "settled" && prevAttr > 0)
      || incomingAttr > prevAttr + 1e-9;
    if (allowStakeUpdate) {
      merged.betMoney = betMoneyForMerge;
      bet_money = betMoneyForMerge;
      if (Object.prototype.hasOwnProperty.call(o, "money") || Object.prototype.hasOwnProperty.call(o, "Money")) {
        money = parseNum(o.money ?? o.Money, 0);
        merged.money = money;
      }
    }
    else if (betMoneyForMerge > 0) {
      merged.betMoney = betMoneyForMerge;
      bet_money = betMoneyForMerge;
    }
    if (isChangmen) {
      merged.pmOrigin = merged.pmOrigin || "changmen";
      merged.pmSide = "buy";
    }
  }

  if (!isSell) {
    const fillShares = preservePmBuyFillShares(prevRaw, o, merged);
    if (fillShares != null)
      merged.pmShares = fillShares;
    const fillPrice = preservePmFillPrice(prevRaw, o, merged);
    if (fillPrice != null)
      merged.pmFillPrice = fillPrice;
  }

  return { raw: merged, money, bet_money };
}

export async function listByDate(date, userId) {
  const target = date || toDateKey(Date.now());
  const rows = await sb.fetchOrdersByDate(target, userId);
  return rows.map(rowToOrder);
}

export async function listByDatePage(date, userId, pageIndex = 1, pageSize = 1024) {
  const target = date || toDateKey(Date.now());
  const page = Math.max(1, Number(pageIndex) || 1);
  const size = Math.max(1, Number(pageSize) || 1024);
  const { rows, total } = await sb.fetchOrdersByDatePage(target, userId, page, size);
  const dayRows = rows || [];
  // [changmen 扩展] 并入同 Link 跨日订单（PM 昨天买今天卖等同组展示）
  const links = [...new Set(
    dayRows.map(r => Number(r.link) || 0).filter(n => n !== 0),
  )];
  let merged = dayRows;
  if (links.length && typeof sb.fetchOrdersByLinks === "function") {
    const siblings = await sb.fetchOrdersByLinks(userId, links);
    if (siblings?.length) {
      const byId = new Map();
      for (const r of dayRows)
        byId.set(String(r.order_id ?? "").trim().toLowerCase(), r);
      for (const r of siblings) {
        const id = String(r.order_id ?? "").trim().toLowerCase();
        if (id && !byId.has(id))
          byId.set(id, r);
      }
      merged = [...byId.values()].sort(
        (a, b) => (Number(b.create_at) || 0) - (Number(a.create_at) || 0),
      );
    }
  }
  // PM 卖单归买单日：卖出日不再单独展示该组
  merged = filterRawOrdersBelongingToDate(merged, target);
  return { list: merged.map(rowToOrder), total };
}

export async function listByPlayer(playerId, userId) {
  const rows = await sb.fetchOrdersByPlayer(playerId, userId);
  return rows.map(rowToOrder);
}

export async function saveOrder(playerId, orders, userId, typeFallback = "") {
  if (!userId || !Array.isArray(orders))
    return false;
  if (!orders.length)
    return true;
  const defaultProvider = String(typeFallback || "").trim();
  // [changmen 扩展] 允许 changmen 手动卖单落库（同 Link + pmBuyOrderId）
  const incoming = orders;
  if (!incoming.length)
    return true;
  const incomingResolved = incoming.map((o) => {
    const rawCreate = o.createAt ?? o.CreateAt;
    const parsed = parseVenueCreateAt(rawCreate, 0);
    const fallbackAt = parsed > 0 ? parsed : Date.now();
    const orderId = String(o.orderId || `${playerId}-${fallbackAt}`);
    return { o, orderId, parsed, fallbackAt };
  });
  const prefetchOrderIds = [];
  for (const { o, orderId } of incomingResolved) {
    prefetchOrderIds.push(orderId);
    const buyOrderId = String(o.pmBuyOrderId ?? o.PmBuyOrderId ?? "").trim();
    if (buyOrderId)
      prefetchOrderIds.push(buyOrderId);
  }
  const existing = await sb.fetchOrdersByPlayerOrderIds(playerId, userId, prefetchOrderIds);
  const linkByOrderId = new Map(
    existing.map(r => [String(r.order_id), Number(r.link) || 0]),
  );
  const existingByOrderId = new Map(
    existing.map(r => [String(r.order_id), r]),
  );

  const assignedInBatch = new Map();
  const rows = [];
  for (const { o, orderId, parsed, fallbackAt } of incomingResolved) {
    const prevAt = Number(existingByOrderId.get(orderId)?.create_at) || 0;
    const createAt = parsed > 0 ? parsed : prevAt > 0 ? prevAt : fallbackAt;
    const prevRow = existingByOrderId.get(orderId);
    const prevRaw = prevRow?.raw && typeof prevRow.raw === "object" && !Array.isArray(prevRow.raw)
      ? prevRow.raw
      : {};
    const provider = o.provider || o.Type || defaultProvider || "";
    const link = resolveSaveOrderLink(
      o,
      prevRaw,
      orderId,
      createAt,
      linkByOrderId,
      existingByOrderId,
      assignedInBatch,
      provider,
    );
    assignedInBatch.set(orderId, link);
    const incomingOrigin = o.pmOrigin;
    const prevOrigin = prevRaw.pmOrigin;
    let pmOrigin = incomingOrigin;
    if (prevOrigin === "changmen" && incomingOrigin === "external")
      pmOrigin = "changmen";
    else if (!pmOrigin)
      pmOrigin = prevOrigin || (provider === "Polymarket" ? "external" : undefined);
    const { raw, money, bet_money } = mergePolymarketLogicalSave(prevRow, prevRaw, o, pmOrigin);
    rows.push({
      user_id: String(userId),
      player_id: Number(playerId),
      order_id: orderId,
      link,
      provider,
      match: o.match || o.Match || "",
      bet: o.bet || o.Bet || "",
      item: o.item || o.Item || "",
      odds: parseNum(o.odds, 0),
      bet_money,
      money,
      status: mapStatus(raw.status ?? o.status ?? o.Status),
      create_at: createAt,
      raw,
    });
  }
  return rows.length ? await sb.upsertOrders(rows) : true;
}

function isUuidUserId(userId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(userId ?? ""));
}

function stringToHashNumber(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** 排行榜：按登录用户聚合当日 orders（非按 player_id / 平台账号）；管理员不参与 */
export async function listUserProfitRank(dateKey = toDateKey(Date.now())) {
  const [orders, profiles] = await Promise.all([
    sb.fetchOrdersForProfitAggregate(dateKey),
    sb.fetchProfiles(),
  ]);
  const adminIds = new Set(
    (profiles || []).filter(p => isAdminUser(p)).map(p => String(p.id)),
  );
  const nameById = new Map(
    (profiles || []).map(p => [String(p.id), String(p.user_name || "").trim()]),
  );
  const agg = new Map();
  for (const o of orders || []) {
    const uid = String(o.user_id || "");
    if (!uid || adminIds.has(uid))
      continue;
    if (!agg.has(uid))
      agg.set(uid, { money: 0, count: 0, betMoney: 0 });
    const row = agg.get(uid);
    const status = String(o.status || "");
    if (status === "Reject")
      continue;
    row.money += Number(o.money) || 0;
    row.betMoney += Number(o.bet_money) || 0;
    row.count += 1;
  }
  const result = [];
  for (const [uid, stats] of agg) {
    if (adminIds.has(uid))
      continue;
    const userName = nameById.get(uid) || uid.slice(0, 8);
    result.push({
      UserID: stringToHashNumber(userName),
      UserName: userName,
      Money: stats.money,
      Count: stats.count,
      BetMoney: stats.betMoney,
      Date: dateKey,
    });
  }
  return result.sort((a, b) => b.Money - a.Money);
}

/** 解析 Client_SaveOrderBind 单行（对齐 A8 `nA`：LinkID + Provider + OrderID） */
export function parseOrderBindRow(row) {
  return {
    orderId: String(row?.orderId ?? row?.OrderID ?? ""),
    playerId: Number(row?.playerId ?? row?.PlayerID) || 0,
    linkId: Number(row?.linkId ?? row?.LinkID) || 0,
    provider: String(row?.Provider ?? row?.provider ?? ""),
  };
}

export async function saveOrderBind(orders, userId) {
  if (!userId || !Array.isArray(orders))
    return false;
  let ok = true;
  for (const raw of orders) {
    const { orderId, playerId, linkId, provider } = parseOrderBindRow(raw);
    if (!orderId || !linkId)
      continue;
    const updated = await sb.updateOrderBind(orderId, userId, linkId, {
      playerId,
      provider,
    });
    if (!updated)
      ok = false;
  }
  return ok;
}

/** [changmen 扩展] 侧栏手动改绑单笔 Link（新→老） */
export async function rebindOrderLink(userId, orderId, toLinkId) {
  return sb.rebindOrderLink(userId, orderId, toLinkId);
}

export function ensureSeed() {}
