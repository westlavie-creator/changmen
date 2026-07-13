import * as sb from "@changmen/db";
import { isAdminUser } from "../../auth/admin_auth.js";
import { resolveVisibleUserIds } from "../../auth/role_filter.js";
import { resolvePolymarketBuilderCode } from "./builder_code.js";
import { fetchAllBuilderTrades } from "./builder_trades.js";
import { collectPolymarketUserAddresses, parsePolymarketTokenConfig } from "./clob_l2.js";
import { isPolymarketRelayerConfigured, getPolymarketRelayerAuthMode } from "./relayer_config.js";

function normalizeEthAddress(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : "";
}

/** Polymarket 钱包/funder 地址 → changmen 用户名（如 gb12） */
export function buildPolymarketAddressUserIndex(profiles = []) {
  const out = new Map();
  for (const profile of profiles) {
    const userName = String(profile.user_name ?? profile.userName ?? "").trim();
    if (!userName)
      continue;
    const accounts = Array.isArray(profile.accounts) ? profile.accounts : [];
    for (const acc of accounts) {
      if (String(acc?.provider ?? "").trim().toLowerCase() !== "polymarket")
        continue;
      indexPolymarketAccountCredentials(userName, acc, out, null);
    }
  }
  return out;
}

function indexPolymarketAccountCredentials(userName, acc, byAddress, byOwner) {
  const config = parsePolymarketTokenConfig(acc?.token);
  for (const addr of collectPolymarketUserAddresses(config)) {
    if (byAddress)
      byAddress.set(addr, userName);
  }
  for (const raw of [
    acc?.walletAddress,
    acc?.address,
    acc?.funder,
    acc?.funderAddress,
    config?.walletAddress,
    config?.address,
    config?.funder,
    config?.funderAddress,
  ]) {
    const addr = normalizeEthAddress(raw);
    if (addr && byAddress)
      byAddress.set(addr, userName);
  }
  if (!byOwner)
    return;
  const apiCreds = config?.apiCreds && typeof config.apiCreds === "object"
    ? config.apiCreds
    : config;
  for (const raw of [
    apiCreds?.apiKey,
    apiCreds?.key,
    apiCreds?.api_key,
    config?.apiKey,
    config?.key,
    acc?.venueMemberId,
    acc?.venueId,
  ]) {
    const key = String(raw ?? "").trim().toLowerCase();
    if (key)
      byOwner.set(key, userName);
  }
}

/**
 * Builder 成交用户反查：优先 owner（CLOB apiKey），其次 maker（proxy/funder 地址）。
 * 账号真相在 players.account_data；profiles.accounts 仅作兼容回退。
 */
export function buildPolymarketTradeUserIndex({ playerRows = [], profiles = [] } = {}) {
  const byAddress = new Map();
  const byOwner = new Map();

  for (const row of playerRows) {
    const userName = String(row.user_name ?? "").trim();
    if (!userName)
      continue;
    const acc = row.account_data && typeof row.account_data === "object"
      ? row.account_data
      : {};
    indexPolymarketAccountCredentials(
      userName,
      {
        ...acc,
        venueMemberId: row.venue_member_id || acc.venueMemberId,
      },
      byAddress,
      byOwner,
    );
  }

  for (const [addr, userName] of buildPolymarketAddressUserIndex(profiles)) {
    if (!byAddress.has(addr))
      byAddress.set(addr, userName);
  }

  return { byAddress, byOwner };
}

function resolveTradeUserName(trade, index) {
  const ownerKey = String(trade?.owner ?? "").trim().toLowerCase();
  if (ownerKey && index.byOwner.has(ownerKey))
    return index.byOwner.get(ownerKey);
  const addr = normalizeEthAddress(trade?.maker);
  return addr ? (index.byAddress.get(addr) || "") : "";
}

function parseRange(body = {}) {
  if (body.startMs && body.endMs) {
    return {
      startMs: Number(body.startMs),
      endMs: Number(body.endMs),
    };
  }
  if (body.month) {
    const parts = String(body.month).split("-").map(Number);
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || new Date().getMonth() + 1;
    return {
      startMs: new Date(y, m - 1, 1, 0, 0, 0, 0).getTime(),
      endMs: new Date(y, m, 1, 0, 0, 0, 0).getTime(),
    };
  }
  const dk = body.date || new Date().toISOString().slice(0, 10);
  const parts = String(dk).split("-").map(Number);
  const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1, 0, 0, 0, 0);
  const startMs = d.getTime();
  return { startMs, endMs: startMs + 86400000 };
}

function summarizeChangmenOrders(orders) {
  let totalBet = 0;
  let totalProfit = 0;
  let wins = 0;
  let losses = 0;
  let rejects = 0;
  let pending = 0;
  for (const o of orders) {
    totalBet += Number(o.bet_money) || 0;
    totalProfit += Number(o.money) || 0;
    if (o.status === "Win")
      wins += 1;
    else if (o.status === "Lose")
      losses += 1;
    else if (o.status === "Reject")
      rejects += 1;
    else
      pending += 1;
  }
  return {
    orderCount: orders.length,
    totalBet,
    totalProfit,
    wins,
    losses,
    rejects,
    pending,
  };
}

function mapChangmenOrder(row) {
  let matchTitle = "";
  let betTitle = "";
  try {
    const match = typeof row.match === "string" ? JSON.parse(row.match) : row.match;
    matchTitle = match?.Title || match?.title || "";
  }
  catch { /* ignore */ }
  try {
    const bet = typeof row.bet === "string" ? JSON.parse(row.bet) : row.bet;
    betTitle = bet?.Title || bet?.title || "";
  }
  catch { /* ignore */ }
  return {
    orderId: row.order_id,
    userId: row.user_id,
    userName: row.user_name || "",
    playerId: row.player_id,
    playerName: row.player_name || "",
    status: row.status,
    betMoney: Number(row.bet_money) || 0,
    profit: Number(row.money) || 0,
    message: row.message || "",
    matchTitle,
    betTitle,
    item: row.item || "",
    createAt: Number(row.create_at) || 0,
    updateAt: Number(row.update_at) || 0,
  };
}

/**
 * Builder 看板：Polymarket 归因成交 + changmen Polymarket 订单对照。
 */
export async function getPolymarketBuilderDashboard(body = {}, caller = null) {
  const { startMs, endMs } = parseRange(body);
  const afterSec = Math.floor(startMs / 1000);
  const beforeSec = Math.floor(endMs / 1000);
  const maxPages = Number(body.maxPages) || 5;
  const orderLimit = Math.min(Math.max(Number(body.orderLimit) || 100, 1), 500);

  let userIds;
  const builderCode = resolvePolymarketBuilderCode();
  const [polyResult, changmenRows, allProfiles, pmPlayerRows] = await Promise.all([
    fetchAllBuilderTrades({ afterSec, beforeSec, maxPages }),
    sb.fetchPolymarketOrdersInRange(startMs, endMs, undefined, orderLimit),
    sb.fetchProfilesAdmin(),
    sb.fetchPolymarketPlayersForTradeLookup(),
  ]);

  if (caller && !isAdminUser(caller)) {
    const visibleIds = resolveVisibleUserIds(caller, allProfiles);
    if (visibleIds)
      userIds = [...visibleIds];
  }

  const changmenRowsFiltered = userIds
    ? changmenRows.filter(row => userIds.includes(String(row.user_id)))
    : changmenRows;
  const changmenOrders = changmenRowsFiltered.map(mapChangmenOrder);
  const tradeUserIndex = buildPolymarketTradeUserIndex({
    playerRows: pmPlayerRows,
    profiles: allProfiles,
  });
  const trades = polyResult.trades.map(t => ({
    ...t,
    makerUserName: resolveTradeUserName(t, tradeUserIndex),
  }));

  return {
    startMs,
    endMs,
    builderCode,
    relayerConfigured: isPolymarketRelayerConfigured(),
    relayerAuthMode: getPolymarketRelayerAuthMode(),
    polymarket: {
      ...polyResult,
      trades,
      summary: polyResult.summary,
    },
    changmen: {
      orders: changmenOrders,
      summary: summarizeChangmenOrders(changmenOrders),
    },
  };
}
