import * as sb from "@changmen/db";
import {
  backendBindLinkFromCreateAt,
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

function resolveSaveOrderLink(o, prevRaw, orderId, createAt, linkByOrderId, existingByOrderId, assignedInBatch, provider) {
  const incomingSide = String(o.pmSide ?? prevRaw.pmSide ?? "").toLowerCase();
  const buyOrderId = String(o.pmBuyOrderId ?? prevRaw.pmBuyOrderId ?? "").trim();
  // PM 卖单：始终跟对应买单 Link（绑定修正时覆盖旧占位 link）
  if (provider === "Polymarket" && incomingSide === "sell" && buyOrderId) {
    const buyLink = parseNum(existingByOrderId.get(buyOrderId)?.link, 0)
      || parseNum(assignedInBatch.get(buyOrderId), 0);
    if (buyLink !== 0)
      return buyLink;
  }

  const boundLink = linkByOrderId.get(orderId);
  if (boundLink != null && boundLink !== 0)
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

function rowToOrder(r) {
  const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
  let betMoney = r.bet_money || 0;
  let money = r.money || 0;
  if (raw.pmSide === "sell") {
    const costUsdc = parseNum(raw.pmStakeUsdc, 0);
    if (costUsdc > 0 && betMoney > 0)
      money = Math.round(betMoney - costUsdc * 7);
  }
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

function mergePolymarketLogicalSave(prevRow, prevRaw, o, pmOrigin) {
  const provider = String(o.provider || o.Type || "").trim();
  let merged = pmOrigin ? { ...o, pmOrigin } : { ...o };
  let money = parseNum(o.money ?? o.Money, 0);
  let bet_money = parseNum(o.betMoney ?? o.BetMoney, 0);

  if (provider !== "Polymarket")
    return { raw: merged, money, bet_money };

  const incomingSide = String(o.pmSide ?? prevRaw.pmSide ?? "buy").toLowerCase();
  const isSell = incomingSide === "sell";
  const isChangmen = pmOrigin === "changmen" || prevRaw.pmOrigin === "changmen";
  const incomingStatus = mapStatus(o.status || o.Status);
  const prevBet = parseNum(prevRaw.betMoney, parseNum(prevRow?.bet_money, 0));
  const incomingBet = parseNum(o.betMoney ?? o.BetMoney, 0);

  merged.pmSide = isSell ? "sell" : "buy";

  if (isSell) {
    const proceedsBet = incomingBet > 0 ? incomingBet : (prevBet > 0 ? prevBet : 0);
    if (isChangmen || prevRaw.pmOrigin === "changmen") {
      merged = {
        ...merged,
        pmSide: "sell",
        pmOrigin: "changmen",
        betMoney: prevBet > 0 ? prevBet : (incomingBet > 0 ? incomingBet : proceedsBet),
        pmBuyOrderId: prevRaw.pmBuyOrderId ?? merged.pmBuyOrderId ?? o.pmBuyOrderId,
        pmRealizedPnlUsdc: prevRaw.pmRealizedPnlUsdc ?? merged.pmRealizedPnlUsdc,
      };
      bet_money = parseNum(merged.betMoney, proceedsBet);
      money = parseNum(prevRaw.money ?? prevRow?.money, parseNum(o.money ?? o.Money, 0));
      merged.money = money;
      const costUsdc = parseNum(merged.pmStakeUsdc ?? prevRaw.pmStakeUsdc, 0);
      if (costUsdc > 0 && bet_money > 0) {
        const profitCny = Math.round(bet_money - costUsdc * 7);
        merged.money = profitCny;
        merged.pmRealizedPnlUsdc = Math.round((profitCny / 7) * 10000) / 10000;
        money = profitCny;
      }
      return { raw: merged, money, bet_money };
    }

    // 官网/CLOB 卖单：reconcile 结果为准，允许修正错误 pmBuyOrderId
    merged = {
      ...merged,
      pmSide: "sell",
      pmOrigin: "external",
      pmBuyOrderId: merged.pmBuyOrderId ?? o.pmBuyOrderId ?? prevRaw.pmBuyOrderId,
      betMoney: incomingBet > 0 ? incomingBet : prevBet,
      pmStakeUsdc: parseNum(merged.pmStakeUsdc ?? o.pmStakeUsdc, parseNum(prevRaw.pmStakeUsdc, 0)),
      pmRealizedPnlUsdc: merged.pmRealizedPnlUsdc ?? o.pmRealizedPnlUsdc ?? prevRaw.pmRealizedPnlUsdc,
    };
    bet_money = parseNum(merged.betMoney, proceedsBet);
    const costUsdc = parseNum(merged.pmStakeUsdc, 0);
    if (costUsdc > 0 && bet_money > 0) {
      const profitCny = Math.round(bet_money - costUsdc * 7);
      merged.money = profitCny;
      merged.pmRealizedPnlUsdc = Math.round((profitCny / 7) * 10000) / 10000;
      money = profitCny;
    }
    else {
      money = parseNum(merged.money ?? o.money ?? o.Money, parseNum(prevRaw.money, 0));
      merged.money = money;
    }
    return { raw: merged, money, bet_money };
  }

  const prevAttributed = parseNum(prevRaw.pmAttributedSellShares, 0);
  const prevState = prevRaw.pmSellState;
  const betMoneyForMerge = prevBet > 0 ? prevBet : incomingBet;

  if (isChangmen && (prevAttributed > 0 || prevState === "partial" || prevState === "closed")) {
    merged = {
      ...merged,
      pmSide: "buy",
      pmOrigin: "changmen",
      pmStakeUsdc: prevRaw.pmStakeUsdc ?? merged.pmStakeUsdc,
      betMoney: betMoneyForMerge,
      pmSellState: prevRaw.pmSellState ?? merged.pmSellState,
      pmAttributedSellShares: prevRaw.pmAttributedSellShares ?? merged.pmAttributedSellShares,
      money: incomingStatus === "Win" || incomingStatus === "Lose"
        ? (o.money ?? o.Money ?? prevRaw.money ?? merged.money)
        : 0,
    };
    bet_money = betMoneyForMerge;
    const prevMoney = parseNum(prevRow?.money, 0);
    if (incomingStatus === "Win" || incomingStatus === "Lose") {
      merged.status = o.status || o.Status;
      merged.pmSellState = "settled";
      money = parseNum(o.money ?? o.Money, prevMoney);
    }
    else {
      money = 0;
    }
  }
  else {
    if (betMoneyForMerge > 0) {
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
  }

  return { raw: merged, money, bet_money };
}

export async function listByDate(date, userId) {
  const target = date || toDateKey(Date.now());
  const rows = await sb.fetchOrdersByDate(target, userId);
  return rows.map(rowToOrder);
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
  const existing = await sb.fetchOrdersByPlayerAll(playerId, userId);
  const linkByOrderId = new Map(
    existing.map(r => [String(r.order_id), Number(r.link) || 0]),
  );
  const existingByOrderId = new Map(
    existing.map(r => [String(r.order_id), r]),
  );

  const assignedInBatch = new Map();
  const rows = [];
  for (const o of orders) {
    const rawCreate = o.createAt ?? o.CreateAt;
    const parsed = parseVenueCreateAt(rawCreate, 0);
    const orderId = String(o.orderId || `${playerId}-${parsed || Date.now()}`);
    const prevAt = Number(existingByOrderId.get(orderId)?.create_at) || 0;
    const createAt = parsed > 0 ? parsed : prevAt > 0 ? prevAt : Date.now();
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
      status: mapStatus(o.status || o.Status),
      create_at: createAt,
      raw,
    });
  }
  return sb.upsertOrders(rows);
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

export function ensureSeed() {}
