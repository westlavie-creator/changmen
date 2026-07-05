#!/usr/bin/env node
/**
 * 补结算 RDS 中 Polymarket + None 的老订单（超出客户端 30 天 sync 窗口）
 *
 *   node scripts/backfill-polymarket-order-settlement.mjs --dry-run
 *   node scripts/backfill-polymarket-order-settlement.mjs --user gb12 --days 90 --execute
 *   node scripts/backfill-polymarket-order-settlement.mjs --player-id 42 --execute
 */
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { accountMultiplyScale, scaleUsdtToCnyDisplay } from "@changmen/shared/account_multiply";
import {
  fetchGammaMarketsByConditionIds,
  computePolymarketSettlement,
  computePolymarketSettlementFromOrderRaw,
  mapDbStatus,
  normalizeConditionId,
  lookupGammaMarket,
  polymarketBuyStakeUsdc,
  enrichMarketsFromClob,
  orderLabelsFromMarket,
  isHexMatchFallback,
} from "../core/integrations/polymarket/settlement.js";
import {
  fetchPolymarketTradesSince,
  indexPolymarketBuyTrades,
  collectPolymarketUserAddresses,
  parsePolymarketTokenConfig,
} from "../core/integrations/polymarket/clob_l2.js";

loadChangmenEnv();

const { initDatabaseUrl, getPgPool, fetchProfiles, upsertOrders } = await import("@changmen/db");

function parseArgs(argv) {
  const out = {
    dryRun: true,
    userName: "",
    playerId: 0,
    days: 365,
    maxPages: 30,
    fixTitles: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--execute")
      out.dryRun = false;
    else if (a === "--dry-run")
      out.dryRun = true;
    else if (a === "--user")
      out.userName = String(argv[++i] ?? "").trim();
    else if (a === "--player-id")
      out.playerId = Number(argv[++i]) || 0;
    else if (a === "--days")
      out.days = Math.max(1, Number(argv[++i]) || 365);
    else if (a === "--max-pages")
      out.maxPages = Math.max(1, Number(argv[++i]) || 30);
    else if (a === "--fix-titles")
      out.fixTitles = true;
    else if (a === "--help" || a === "-h")
      out.help = true;
  }
  return out;
}

function isPolymarketProvider(provider) {
  return String(provider ?? "").trim().toLowerCase() === "polymarket";
}

function scalePmMoneyUsdc(usdc) {
  return scaleUsdtToCnyDisplay(Number(usdc) || 0);
}

/** player_id -> { userId, userName, token, gateway, multiply, playerName } */
function buildPolymarketAccountIndex(profiles, userNameFilter = "") {
  const out = new Map();
  const wantUser = userNameFilter.toLowerCase();
  for (const profile of profiles) {
    const userId = String(profile.id ?? profile.user_id ?? "");
    const userName = String(profile.user_name ?? profile.userName ?? "");
    if (wantUser && userName.toLowerCase() !== wantUser)
      continue;
    const accounts = Array.isArray(profile.accounts) ? profile.accounts : [];
    for (const acc of accounts) {
      if (!isPolymarketProvider(acc?.provider))
        continue;
      const playerId = Number(acc.accountId ?? acc.playerId);
      if (!Number.isFinite(playerId) || playerId <= 0)
        continue;
      out.set(playerId, {
        userId,
        userName,
        playerName: String(acc.playerName ?? acc.userName ?? ""),
        token: String(acc.token ?? ""),
        gateway: String(acc.gateway ?? "").trim(),
        multiply: accountMultiplyScale(acc.multiply),
      });
    }
  }
  return out;
}

async function fetchPolymarketOrdersForBackfill(pool, { sinceMs, userName, playerId, fixTitles }) {
  const params = [sinceMs];
  let sql = `
    SELECT o.*, p.user_name
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.user_id
    WHERE LOWER(o.provider) = 'polymarket'
      AND o.create_at >= $1
      AND (
        o.status = 'None'
        ${fixTitles ? "OR o.match ~ '^0x[0-9a-f]+…'" : ""}
      )
  `;
  if (userName) {
    params.push(userName);
    sql += ` AND LOWER(p.user_name) = LOWER($${params.length})`;
  }
  if (playerId > 0) {
    params.push(playerId);
    sql += ` AND o.player_id = $${params.length}`;
  }
  sql += " ORDER BY o.create_at ASC";
  const { rows } = await pool.query(sql, params);
  return rows ?? [];
}

function groupByPlayer(rows) {
  const out = new Map();
  for (const row of rows) {
    const pid = Number(row.player_id);
    const list = out.get(pid) ?? [];
    list.push(row);
    out.set(pid, list);
  }
  return out;
}

function rawStakeFromTrade(trade) {
  return polymarketBuyStakeUsdc(trade.size, Number(trade.price));
}

function rawFromRow(row) {
  return typeof row.raw === "object" && row.raw && !Array.isArray(row.raw) ? row.raw : {};
}

function stakeUsdcFromRow(row) {
  const raw = rawFromRow(row);
  const fromRaw = Number(raw.pmStakeUsdc);
  if (Number.isFinite(fromRaw) && fromRaw > 0)
    return fromRaw;
  const betCny = Number(row.bet_money) || 0;
  if (betCny > 0)
    return Math.round((betCny / 7) * 10000) / 10000;
  return 0;
}

function computeSettlementForRow(row, trade, market) {
  if (trade) {
    const stakeRaw = rawStakeFromTrade(trade);
    return computePolymarketSettlement(trade, market, stakeRaw);
  }
  const raw = rawFromRow(row);
  if (!raw.pmTokenId)
    return null;
  const stakeUsdc = stakeUsdcFromRow(row);
  return computePolymarketSettlementFromOrderRaw(raw, market, stakeUsdc);
}

async function settlePlayerOrders(playerId, orders, account, { maxPages, dryRun }) {
  const result = {
    playerId,
    playerName: account.playerName,
    userName: account.userName,
    scanned: orders.length,
    settled: 0,
    stillNone: 0,
    skippedNoTrade: 0,
    skippedNoMarket: 0,
    updates: [],
  };

  if (!account.token) {
    console.warn(`[player ${playerId}] 无 token，仅尝试 raw+Gamma 补结算`);
  }

  const minCreateAt = Math.min(...orders.map(o => Number(o.create_at) || Date.now()));
  const afterSec = Math.floor(minCreateAt / 1000) - 86_400;

  let trades = [];
  if (account.token) {
    try {
      trades = await fetchPolymarketTradesSince({
        token: account.token,
        gateway: account.gateway || undefined,
        afterSec,
        maxPages,
      });
    }
    catch (err) {
      result.error = err.message;
      return result;
    }
  }

  const tradeByOrderId = indexPolymarketBuyTrades(
    trades,
    account.token
      ? collectPolymarketUserAddresses(parsePolymarketTokenConfig(account.token))
      : new Set(),
  );
  const conditionIds = [];
  const tokenIds = [];
  for (const row of orders) {
    const raw = rawFromRow(row);
    const trade = tradeByOrderId.get(String(row.order_id));
    if (trade) {
      if (trade.market)
        conditionIds.push(String(trade.market));
      if (trade.asset_id ?? trade.assetId)
        tokenIds.push(String(trade.asset_id ?? trade.assetId));
    }
    if (raw.pmConditionId)
      conditionIds.push(String(raw.pmConditionId));
    if (raw.pmTokenId)
      tokenIds.push(String(raw.pmTokenId));
  }

  let marketMap = new Map();
  try {
    marketMap = await fetchGammaMarketsByConditionIds(conditionIds, tokenIds);
    await enrichMarketsFromClob(marketMap, conditionIds, account.gateway || undefined);
  }
  catch (err) {
    result.error = `Gamma 查询失败: ${err.message}`;
    return result;
  }

  for (const row of orders) {
    const orderId = String(row.order_id);
    const raw = rawFromRow(row);
    const trade = tradeByOrderId.get(orderId);
    const marketKey = trade
      ? trade
      : (raw.pmConditionId
        ? { market: raw.pmConditionId, asset_id: raw.pmTokenId }
        : null);

    if (!marketKey) {
      result.skippedNoTrade += 1;
      continue;
    }

    const market = lookupGammaMarket(marketMap, marketKey);
    if (!market) {
      result.skippedNoMarket += 1;
      continue;
    }

    const computed = computeSettlementForRow(row, trade, market);
    const labels = orderLabelsFromMarket(market);
    const needsTitleFix = isHexMatchFallback(row.match) && !!labels.match;
    const isUnsettled = String(row.status) === "None";

    if (!isUnsettled && !needsTitleFix)
      continue;

    if (isUnsettled && (!computed || computed.status === "none")) {
      result.stillNone += 1;
      continue;
    }

    const next = {
      user_id: String(row.user_id),
      player_id: Number(row.player_id),
      order_id: orderId,
      link: row.link,
      provider: row.provider || "Polymarket",
      match: (labels.match && (isHexMatchFallback(row.match) || isUnsettled || !row.match))
        ? labels.match
        : (row.match || ""),
      bet: (!row.bet && labels.bet) ? labels.bet : (row.bet || ""),
      item: row.item || "",
      odds: Number(row.odds) || 0,
      bet_money: Number(row.bet_money) || 0,
      money: isUnsettled ? scalePmMoneyUsdc(computed.money) : (Number(row.money) || 0),
      status: isUnsettled ? mapDbStatus(computed.status) : String(row.status || "None"),
      create_at: Number(row.create_at) || Date.now(),
      raw: {
        ...raw,
        ...(isUnsettled && computed.status !== "none"
          ? { pmSellState: "settled", status: computed.status }
          : {}),
        backfillSettlement: {
          at: Date.now(),
          ...(isUnsettled
            ? { status: computed.status, via: trade ? "clob" : "raw" }
            : { titleFix: true }),
        },
      },
    };

    result.updates.push({
      orderId,
      from: isUnsettled ? "None" : row.match,
      to: isUnsettled ? next.status : next.match,
      money: next.money,
      match: next.match,
      item: row.item,
    });
    result.settled += 1;

    if (!dryRun)
      await upsertOrders([next]);
  }

  return result;
}

const args = parseArgs(process.argv);
if (args.help) {
  console.log(`用法:
  node scripts/backfill-polymarket-order-settlement.mjs [选项]

选项:
  --dry-run          仅预览（默认）
  --execute          写入 RDS
  --user <登录名>     限定用户
  --player-id <id>   限定 Polymarket 账号 player_id
  --days <N>         扫描近 N 天 None 订单（默认 365）
  --fix-titles       同时修复 match 为 0x… 占位符的已结算订单标题
`);
  process.exit(0);
}

await initDatabaseUrl();
const pool = getPgPool();
if (!pool) {
  console.error("DATABASE_URL 未配置或无法连接 RDS");
  process.exit(1);
}

const sinceMs = Date.now() - args.days * 86_400_000;
const profiles = await fetchProfiles();
const accountIndex = buildPolymarketAccountIndex(profiles, args.userName);
const orders = await fetchPolymarketOrdersForBackfill(pool, {
  sinceMs,
  userName: args.userName,
  playerId: args.playerId,
  fixTitles: args.fixTitles,
});

console.log(`模式: ${args.dryRun ? "dry-run" : "execute"}${args.fixTitles ? " + fix-titles" : ""}`);
console.log(`扫描: Polymarket 订单，近 ${args.days} 天，共 ${orders.length} 条`);

if (!orders.length) {
  console.log("无待补结算订单");
  process.exit(0);
}

const byPlayer = groupByPlayer(orders);
let totalSettled = 0;
let totalStillNone = 0;
let totalSkippedTrade = 0;
let totalSkippedMarket = 0;

for (const [playerId, playerOrders] of byPlayer) {
  const account = accountIndex.get(playerId);
  if (!account) {
    console.warn(`player_id=${playerId}: 未找到 Polymarket 账号配置，跳过 ${playerOrders.length} 条`);
    totalSkippedTrade += playerOrders.length;
    continue;
  }

  console.log(`\n[player ${playerId} ${account.playerName || account.userName}] ${playerOrders.length} 条 None…`);
  const summary = await settlePlayerOrders(playerId, playerOrders, account, {
    maxPages: args.maxPages,
    dryRun: args.dryRun,
  });

  if (summary.error) {
    console.warn(`  错误: ${summary.error}`);
    continue;
  }

  totalSettled += summary.settled;
  totalStillNone += summary.stillNone;
  totalSkippedTrade += summary.skippedNoTrade;
  totalSkippedMarket += summary.skippedNoMarket;

  for (const u of summary.updates.slice(0, 20))
    console.log(`  ${u.orderId.slice(0, 14)}… ${u.from} → ${u.to} money=${u.money} | ${u.item}`);
  if (summary.updates.length > 20)
    console.log(`  … 另有 ${summary.updates.length - 20} 条`);

  console.log(
    `  结算 ${summary.settled}，仍 None ${summary.stillNone}，无 trade ${summary.skippedNoTrade}，无 Gamma ${summary.skippedNoMarket}`,
  );
}

console.log("\n=== 汇总 ===");
console.log(`可结算写入: ${totalSettled}${args.dryRun ? "（dry-run 未写入）" : ""}`);
console.log(`仍 None（market 未决）: ${totalStillNone}`);
console.log(`无 CLOB trade: ${totalSkippedTrade}`);
console.log(`无 Gamma market: ${totalSkippedMarket}`);

if (args.dryRun && totalSettled > 0)
  console.log("\n确认后执行: node scripts/backfill-polymarket-order-settlement.mjs --execute ...");
