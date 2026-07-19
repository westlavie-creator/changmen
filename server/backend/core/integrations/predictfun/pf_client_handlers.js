/**
 * Predict.fun 语义 API：Pf_CheckBet / Pf_SubmitOrder / Pf_GetOrder / Pf_GetOrders / Pf_RefreshBalance
 *
 * 会员余额真相：`players.total_balance`（不用 A8 credit）。
 * 订单确认：官方 GET /v1/orders/{hash}（JWT）；拒单退还 stake。
 */

import * as accountStore from "../../account/account_store.js";
import * as orderStore from "../../account/order_store.js";
import { rowToOrder } from "../../account/order_store.js";
import { assertPlayerOwnedByUser } from "../../account/player_ownership.js";
import * as sb from "@changmen/db";
import store from "../../esport-api/store.js";
import { isPredictFunHouseConfigured, resolvePfHouseMaxStakeUsdt } from "./house_credentials.js";
import {
  assertPfAvailableBalance,
  balanceAfterStake,
  roundUsdt,
  summarizePfOrders,
} from "./pf_ledger.js";
import {
  createAndSubmitHouseMarketBuy,
  createAndSubmitHouseMarketSell,
  estimatePfSharesWei,
  isPredictFunOrderAccepted,
  isValidPredictClobPrice,
  prepareHouseSigner,
  resolveExecutableBuy,
  REUSE_BOOK_MAX_AGE_MS,
  weiToDecimal18,
  withHouseOrderLock,
} from "./pf_order_service.js";
import { fetchPredictMarket } from "./pf_api.js";
import { computePfSettlement, resolvePfMarketOutcome } from "./pf_settle.js";
import { extractBuyFillShares, extractSellFill } from "./pf_fill.js";
import { assertPredictMarketTradable } from "./pf_market_guard.js";
import { tryRedeemHouseMarketAfterSettle, redeemHouseResolvedPositions } from "./pf_house_redeem.js";
import {
  fetchHousePredictOrderResolved,
  isOpenChangmenOrderStatus,
  mapPredictOrderToVenueOrder,
  settlementFromPredictOfficialStatus,
  waitForHouseOrderTerminal,
} from "./pf_orders.js";

/** 避免与 account_service 循环依赖：就地写 ACCOUNT 缓存行 */
async function syncAccountRowInKv(accountId, updates, userId) {
  const list = userId ? store.getAccountsForUser(userId) : accountStore.getAccountsFromKv();
  const idx = list.findIndex(row => String(row.accountId) === String(accountId));
  if (idx < 0)
    return null;
  list[idx] = { ...list[idx], ...updates, updateTime: Date.now() };
  if (userId)
    await store.setAccountsForUser(userId, list);
  return list[idx];
}

function requirePlayerId(body) {
  const playerId = body?.playerId;
  if (playerId == null || String(playerId).trim() === "")
    return { ok: false, msg: "playerId 必填" };
  return { ok: true, playerId };
}

function parseIntent(body) {
  const tokenId = String(body?.tokenId ?? "").trim();
  const marketId = String(body?.marketId ?? "").trim();
  const apiBetMoney = Number(body?.apiBetMoney);
  const detectionMaxPrice = Number(body?.detectionMaxPrice ?? body?.maxPrice);
  const detectionOdds = Number(body?.detectionOdds);
  const slippageBpsRaw = body?.slippageBps;
  const slippageBps = slippageBpsRaw == null || slippageBpsRaw === ""
    ? undefined
    : BigInt(String(slippageBpsRaw));

  if (!tokenId)
    return { ok: false, msg: "tokenId 必填" };
  if (!marketId)
    return { ok: false, msg: "marketId 必填" };
  if (!Number.isFinite(apiBetMoney) || apiBetMoney <= 0)
    return { ok: false, msg: "apiBetMoney 无效" };
  if (!isValidPredictClobPrice(detectionMaxPrice))
    return { ok: false, msg: "detectionMaxPrice 无效" };

  const maxStake = resolvePfHouseMaxStakeUsdt();
  if (apiBetMoney > maxStake + 1e-9)
    return { ok: false, msg: `单笔超过上限 ${maxStake} USDT` };

  return {
    ok: true,
    tokenId,
    marketId,
    apiBetMoney: Math.round(apiBetMoney * 100) / 100,
    detectionMaxPrice,
    detectionOdds: Number.isFinite(detectionOdds) && detectionOdds > 1 ? detectionOdds : 0,
    slippageBps,
  };
}

async function assertPfPlayer(body, userId, { requireHouse = true } = {}) {
  if (!userId)
    return { ok: false, msg: "请先登录" };
  if (requireHouse && !isPredictFunHouseConfigured())
    return { ok: false, msg: "VPS 未配置 Predict.fun 主号（API Key + 私钥）" };

  const pid = requirePlayerId(body);
  if (!pid.ok)
    return pid;

  const owned = await assertPlayerOwnedByUser(pid.playerId, userId);
  if (!owned.ok)
    return owned;

  const platformHint = String(
    owned.player?.platformName
      ?? owned.player?.platformId
      ?? "",
  ).toLowerCase();
  if (platformHint && !platformHint.includes("predict")) {
    const blocked = ["polymarket", "ob", "ray", "pb", "tf", "ia", "imt", "hg", "stake"];
    if (blocked.some(p => platformHint === p || platformHint.startsWith(`${p} `)))
      return { ok: false, msg: `playerId ${pid.playerId} 不是 PredictFun 账号` };
  }

  return { ok: true, playerId: pid.playerId, player: owned.player };
}

/**
 * 读取余额；若历史误写在 credit 且 total_balance=0，一次性迁到 total_balance 并清零 credit
 */
async function resolvePfBalance(player, userId, playerId) {
  let bal = roundUsdt(player?.totalBalance);
  const legacyCredit = roundUsdt(player?.credit);
  if (bal === 0 && legacyCredit > 0) {
    await accountStore.updatePlayerBalance(playerId, legacyCredit, userId);
    await syncAccountRowInKv(playerId, {
      balance: legacyCredit,
      credit: 0,
      currency: "USDT",
    }, userId);
    return legacyCredit;
  }
  return bal;
}

async function loadPfOrders(playerId, userId) {
  // 带 raw 扩展字段（pfOrderHash / pfRefundedAt），不改共用 rowToOrder 形状
  const rows = await sb.fetchOrdersByPlayer(playerId, userId);
  return (rows || []).map((r) => {
    const base = rowToOrder(r);
    const raw = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {};
    return {
      ...base,
      pfOrderHash: raw.pfOrderHash ? String(raw.pfOrderHash) : undefined,
      pfApiOrderId: raw.pfApiOrderId ? String(raw.pfApiOrderId) : undefined,
      pfRefundedAt: raw.pfRefundedAt ?? undefined,
      pfMarketId: raw.pfMarketId ? String(raw.pfMarketId) : undefined,
      pfTokenId: raw.pfTokenId ? String(raw.pfTokenId) : undefined,
      pfSharesWei: raw.pfSharesWei ? String(raw.pfSharesWei) : undefined,
      pfShares: raw.pfShares != null ? Number(raw.pfShares) : undefined,
      pfBookPrice: raw.pfBookPrice != null ? Number(raw.pfBookPrice) : undefined,
      pfSellState: raw.pfSellState ? String(raw.pfSellState) : undefined,
      pfSide: raw.pfSide ? String(raw.pfSide) : undefined,
      pfBuyOrderId: raw.pfBuyOrderId ? String(raw.pfBuyOrderId) : undefined,
    };
  });
}

async function publishPfBalance(playerId, userId, balance) {
  const orders = await loadPfOrders(playerId, userId);
  const stats = summarizePfOrders(orders);
  const bal = roundUsdt(balance);
  await accountStore.updatePlayerBalance(playerId, bal, userId);
  const synced = await syncAccountRowInKv(playerId, {
    balance: bal,
    credit: 0,
    currency: "USDT",
    totalProfit: stats.settledPnl,
    unsettle: stats.unsettle,
    orderCount: stats.orderCount,
  }, userId);

  return {
    ok: true,
    info: {
      ...(synced || {}),
      accountId: Number(playerId),
      balance: bal,
      credit: 0,
      currency: "USDT",
      totalProfit: stats.settledPnl,
      unsettle: stats.unsettle,
      orderCount: stats.orderCount,
      settledPnl: stats.settledPnl,
      openStake: stats.openStake,
    },
  };
}

/** Pf_RefreshBalance — 读 total_balance；顺带尝试结算已 RESOLVED 未结单 */
export async function handlePfRefreshBalance(body, userId) {
  const gate = await assertPfPlayer(body, userId, { requireHouse: false });
  if (!gate.ok)
    return gate;
  try {
    // 结算不强制 house 私钥；拉市场只需 API Key（与采集同源）
    try {
      await settleResolvedPfOrdersForPlayer(gate.playerId, userId);
    }
    catch (err) {
      console.warn("[Pf_RefreshBalance] settle skipped", err);
    }
    const owned = await assertPlayerOwnedByUser(gate.playerId, userId);
    const player = owned.ok ? owned.player : gate.player;
    const balance = await resolvePfBalance(player, userId, gate.playerId);
    return await publishPfBalance(gate.playerId, userId, balance);
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pf_CheckBet */
export async function handlePfCheckBet(body, userId) {
  const gate = await assertPfPlayer(body, userId);
  if (!gate.ok)
    return gate;

  const intent = parseIntent(body);
  if (!intent.ok)
    return intent;

  try {
    const balance = await resolvePfBalance(gate.player, userId, gate.playerId);
    const avail = assertPfAvailableBalance(balance, intent.apiBetMoney);
    if (!avail.ok)
      return avail;

    const resolved = await resolveExecutableBuy({
      tokenId: intent.tokenId,
      marketId: intent.marketId,
      detectionOdds: intent.detectionOdds,
      maxPrice: intent.detectionMaxPrice,
    });
    return {
      ok: true,
      info: {
        tokenId: intent.tokenId,
        marketId: intent.marketId,
        apiBetMoney: intent.apiBetMoney,
        detectionOdds: intent.detectionOdds,
        detectionMaxPrice: intent.detectionMaxPrice,
        bookPrice: resolved.bookPrice,
        bookOdds: resolved.bookOdds,
        bookFetchedAt: resolved.bookFetchedAt,
        feeRateBps: resolved.feeRateBps,
        isNegRisk: resolved.isNegRisk,
        isYieldBearing: resolved.isYieldBearing,
        side: "BUY",
        playerId: gate.playerId,
        availableBalance: avail.balance,
      },
    };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pf_SubmitOrder — 成功后记订单并扣减 total_balance */
export async function handlePfSubmitOrder(body, userId) {
  const gate = await assertPfPlayer(body, userId);
  if (!gate.ok)
    return gate;

  const intent = parseIntent(body);
  if (!intent.ok)
    return intent;

  try {
    const balanceBefore = await resolvePfBalance(gate.player, userId, gate.playerId);
    const avail = assertPfAvailableBalance(balanceBefore, intent.apiBetMoney);
    if (!avail.ok)
      return avail;

    console.info(
      `[Pf_SubmitOrder] start player=${gate.playerId} market=${intent.marketId} stake=${intent.apiBetMoney}`,
    );

    // 锁外：预热 signer + 拉盘（与预检并行），锁内只做余额校验 + 签单 POST
    const [fresh0] = await Promise.all([
      resolveExecutableBuy({
        tokenId: intent.tokenId,
        marketId: intent.marketId,
        detectionOdds: intent.detectionOdds,
        maxPrice: intent.detectionMaxPrice,
      }),
      prepareHouseSigner(),
    ]);

    const submitted = await withHouseOrderLock(async () => {
      // 锁内再读一次，避免并发超扣
      const owned = await assertPlayerOwnedByUser(gate.playerId, userId);
      if (!owned.ok)
        throw new Error(owned.msg || "账号校验失败");
      const liveBal = await resolvePfBalance(owned.player, userId, gate.playerId);
      const liveAvail = assertPfAvailableBalance(liveBal, intent.apiBetMoney);
      if (!liveAvail.ok)
        throw new Error(liveAvail.msg || "可用余额不足");

      let fresh = fresh0;
      if (Date.now() - Number(fresh0.bookFetchedAt || 0) > REUSE_BOOK_MAX_AGE_MS) {
        fresh = await resolveExecutableBuy({
          tokenId: intent.tokenId,
          marketId: intent.marketId,
          detectionOdds: intent.detectionOdds,
          maxPrice: intent.detectionMaxPrice,
        });
      }

      const out = await createAndSubmitHouseMarketBuy({
        tokenId: intent.tokenId,
        marketId: intent.marketId,
        apiBetMoney: intent.apiBetMoney,
        maxPrice: intent.detectionMaxPrice,
        maxSlippageBps: intent.slippageBps,
        feeRateBps: fresh.feeRateBps,
        isNegRisk: fresh.isNegRisk,
        isYieldBearing: fresh.isYieldBearing,
        yesBook: fresh.yesBook,
        market: fresh.market,
      });

      return { fresh, out, liveBal };
    });
    console.info(`[Pf_SubmitOrder] lock_done player=${gate.playerId} market=${intent.marketId}`);

    const { fresh, out, liveBal } = submitted;
    if (!isPredictFunOrderAccepted(out.result)) {
      const code = String(out.result?.data?.code ?? "").trim();
      return {
        ok: false,
        msg: code
          ? `Predict.fun 下单未受理（code: ${code}）`
          : "Predict.fun FOK 订单未成交",
        info: {
          result: out.result,
          requestBody: out.requestBody,
        },
      };
    }

    // 官方 GetOrder 路径用 typed-data hash；API orderId 可能同 hash 或另有 id
    const pfOrderHash = String(out.requestBody?.data?.order?.hash ?? "").trim();
    const pfApiOrderId = String(out.result.data?.orderId ?? "").trim();
    const orderId = pfOrderHash || pfApiOrderId;
    const bookOdds = Number(out.bookOdds || fresh.bookOdds) || 0;
    const createAt = Date.now();
    const sharesWei = String(out.sharesWei ?? "").trim();
    const shares = Number(out.shares) || (sharesWei ? weiToDecimal18(sharesWei) : 0);

    await orderStore.saveOrder(gate.playerId, [{
      orderId,
      provider: "PredictFun",
      match: String(intent.marketId),
      bet: "PredictFun",
      item: String(intent.tokenId),
      odds: bookOdds,
      betMoney: intent.apiBetMoney,
      money: 0,
      status: "Pending",
      createAt,
      pfMarketId: intent.marketId,
      pfTokenId: intent.tokenId,
      pfBookPrice: out.bookPrice || fresh.bookPrice,
      pfOrderHash,
      pfApiOrderId,
      pfSharesWei: sharesWei || undefined,
      pfShares: shares > 0 ? shares : undefined,
      pfSide: "buy",
      pfSellState: "open",
    }], userId, "PredictFun");

    const nextBalance = balanceAfterStake(liveBal, intent.apiBetMoney);
    const published = await publishPfBalance(gate.playerId, userId, nextBalance);

    return {
      ok: true,
      info: {
        orderId,
        pfOrderHash: pfOrderHash || null,
        pfApiOrderId: pfApiOrderId || null,
        code: out.result?.data?.code ?? null,
        bookPrice: out.bookPrice || fresh.bookPrice,
        bookOdds: bookOdds || out.bookOdds || fresh.bookOdds,
        result: out.result,
        playerId: gate.playerId,
        pending: true,
        balance: published.ok ? published.info.balance : nextBalance,
        totalProfit: published.ok ? published.info.totalProfit : undefined,
      },
    };
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Pf_SubmitOrder] fail market=${intent?.marketId || "?"} ${msg}`);
    return { ok: false, msg };
  }
}

function rdsOrderKey(row) {
  return String(row?.orderId ?? row?.OrderID ?? "").trim();
}

function rdsOrderStatus(row) {
  return row?.status ?? row?.Status ?? "None";
}

function rdsBetMoney(row) {
  return roundUsdt(row?.betMoney ?? row?.BetMoney);
}

function rdsPfHash(row) {
  return String(row?.pfOrderHash ?? rdsOrderKey(row)).trim();
}

function rdsPfApiOrderId(row) {
  return String(row?.pfApiOrderId ?? "").trim();
}

function rdsAlreadyRefunded(row) {
  if (row?.pfRefundedAt != null)
    return true;
  return String(rdsOrderStatus(row)).toLowerCase() === "reject";
}

function rdsToMapInput(rdsRow) {
  return {
    orderId: rdsOrderKey(rdsRow),
    odds: rdsRow?.odds ?? rdsRow?.Odds,
    betMoney: rdsBetMoney(rdsRow),
    money: rdsRow?.money ?? rdsRow?.Money,
    createAt: rdsRow?.createAt ?? rdsRow?.CreateAt,
    match: rdsRow?.match ?? rdsRow?.Match,
    item: rdsRow?.item ?? rdsRow?.Item,
    link: rdsRow?.link ?? rdsRow?.Link,
    pfMarketId: rdsRow?.pfMarketId,
    pfTokenId: rdsRow?.pfTokenId,
    status: rdsOrderStatus(rdsRow),
    pfSellState: rdsRow?.pfSellState ?? rdsRow?.PfSellState,
    pfSide: rdsRow?.pfSide ?? rdsRow?.PfSide,
    pfBuyOrderId: rdsRow?.pfBuyOrderId ?? rdsRow?.PfBuyOrderId,
    pfShares: rdsRow?.pfShares ?? rdsRow?.PfShares,
  };
}

/**
 * 用官方状态写回 RDS；拒单且仍为未结 → 退还 stake（串行锁 + 幂等）
 * @returns {{ venueOrder: object, refunded: boolean, settlement: string }}
 */
async function syncOfficialOrderToRds(playerId, userId, rdsRow, official) {
  const settlement = settlementFromPredictOfficialStatus(official?.status);
  const venueOrder = mapPredictOrderToVenueOrder(official, rdsToMapInput(rdsRow));

  if (venueOrder.status === "reject" && isOpenChangmenOrderStatus(rdsOrderStatus(rdsRow))) {
    return withHouseOrderLock(async () => {
      const freshList = await loadPfOrders(playerId, userId);
      const key = rdsOrderKey(rdsRow);
      const fresh = freshList.find(row => rdsOrderKey(row) === key) ?? rdsRow;
      if (rdsAlreadyRefunded(fresh) || !isOpenChangmenOrderStatus(rdsOrderStatus(fresh))) {
        return {
          venueOrder: mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh)),
          refunded: false,
          settlement: "unfilled",
        };
      }

      const stake = rdsBetMoney(fresh);
      const nextVenue = mapPredictOrderToVenueOrder(official, rdsToMapInput(fresh));
      await orderStore.saveOrder(playerId, [{
        ...nextVenue,
        status: "reject",
        pfOfficialStatus: official?.status,
        pfOrderHash: rdsPfHash(fresh),
        pfApiOrderId: rdsPfApiOrderId(fresh),
        pfRefundedAt: Date.now(),
      }], userId, "PredictFun");

      let refunded = false;
      if (stake > 0) {
        const owned = await assertPlayerOwnedByUser(playerId, userId);
        if (owned.ok) {
          const bal = await resolvePfBalance(owned.player, userId, playerId);
          await publishPfBalance(playerId, userId, roundUsdt(bal + stake));
          refunded = true;
        }
      }
      return { venueOrder: { ...nextVenue, status: "reject" }, refunded, settlement: "unfilled" };
    });
  }

  if (venueOrder.status === "none" && isOpenChangmenOrderStatus(rdsOrderStatus(rdsRow))) {
    const fill = extractBuyFillShares(official, rdsRow?.pfSharesWei);
    await orderStore.saveOrder(playerId, [{
      ...venueOrder,
      status: "none",
      pfOfficialStatus: official?.status,
      pfOrderHash: rdsPfHash(rdsRow),
      pfApiOrderId: rdsPfApiOrderId(rdsRow),
      pfAmountFilled: fill.amountFilledRaw,
      ...(fill.sharesWei > 0n
        ? {
            pfSharesWei: String(fill.sharesWei),
            pfShares: fill.shares,
          }
        : {}),
    }], userId, "PredictFun");
  }
  else if (venueOrder.status === "pending" && String(rdsOrderStatus(rdsRow)).toLowerCase() !== "pending") {
    await orderStore.saveOrder(playerId, [{
      ...venueOrder,
      status: "pending",
      pfOfficialStatus: official?.status,
      pfOrderHash: rdsPfHash(rdsRow),
      pfApiOrderId: rdsPfApiOrderId(rdsRow),
    }], userId, "PredictFun");
  }

  return { venueOrder, refunded: false, settlement };
}

async function lookupOfficialOrder(rdsRow, orderId) {
  const hash = rdsRow ? (rdsPfHash(rdsRow) || orderId) : orderId;
  // 买单拒单/成交确认：REST + wallet hint（与卖出 waitForHouseOrderTerminal 同源）
  let official = await fetchHousePredictOrderResolved(hash);
  if (official)
    return official;
  const apiId = rdsRow ? rdsPfApiOrderId(rdsRow) : "";
  if (apiId && apiId !== hash)
    official = await fetchHousePredictOrderResolved(apiId);
  return official;
}

/**
 * 对 status=None 的持仓单：市场 RESOLVED 后写 Win/Lose 并加减 total_balance
 * @returns {Promise<{ settled: number, wins: number, losses: number }>}
 */
export async function settleResolvedPfOrdersForPlayer(playerId, userId) {
  const list = await loadPfOrders(playerId, userId);
  const marketCache = new Map();
  let settled = 0;
  let wins = 0;
  let losses = 0;
  let balanceDeltaTotal = 0;

  for (const rdsRow of list) {
    const st = String(rdsOrderStatus(rdsRow)).toLowerCase();
    if (st !== "none")
      continue;
    if (String(rdsRow?.pfSide ?? "").toLowerCase() === "sell")
      continue;
    if (String(rdsRow?.pfSellState ?? "").toLowerCase() === "closed")
      continue;

    const marketId = String(
      rdsRow?.pfMarketId
        ?? rdsRow?.match
        ?? rdsRow?.Match
        ?? "",
    ).trim();
    const tokenId = String(
      rdsRow?.pfTokenId
        ?? rdsRow?.item
        ?? rdsRow?.Item
        ?? "",
    ).trim();
    if (!marketId || !tokenId)
      continue;

    let market = marketCache.get(marketId);
    if (market === undefined) {
      try {
        market = await fetchPredictMarket(marketId);
      }
      catch (err) {
        console.warn("[Pf_Settle] market fetch failed", marketId, err);
        market = null;
      }
      marketCache.set(marketId, market);
    }
    if (!market)
      continue;

    const outcome = resolvePfMarketOutcome(market, tokenId);
    if (!outcome)
      continue;

    const betMoney = rdsBetMoney(rdsRow);
    const odds = Number(rdsRow?.odds ?? rdsRow?.Odds) || 0;
    const computed = computePfSettlement(betMoney, odds, outcome);

    let applied = null;
    await withHouseOrderLock(async () => {
      const freshList = await loadPfOrders(playerId, userId);
      const key = rdsOrderKey(rdsRow);
      const fresh = freshList.find(row => rdsOrderKey(row) === key);
      if (!fresh || String(rdsOrderStatus(fresh)).toLowerCase() !== "none")
        return;

      const venue = mapPredictOrderToVenueOrder(null, rdsToMapInput(fresh));
      await orderStore.saveOrder(playerId, [{
        ...venue,
        status: computed.status,
        money: computed.money,
        pfSettledAt: Date.now(),
        pfMarketStatus: market.status,
        pfOutcomeStatus: outcome,
      }], userId, "PredictFun");
      applied = computed;
    });

    if (!applied)
      continue;

    balanceDeltaTotal = roundUsdt(balanceDeltaTotal + applied.balanceDelta);
    settled += 1;
    if (outcome === "win")
      wins += 1;
    else
      losses += 1;

    if (outcome === "win")
      await tryRedeemHouseMarketAfterSettle(marketId);
  }

  if (settled > 0) {
    const owned = await assertPlayerOwnedByUser(playerId, userId);
    if (owned.ok) {
      const bal = await resolvePfBalance(owned.player, userId, playerId);
      await publishPfBalance(
        playerId,
        userId,
        balanceDeltaTotal !== 0 ? roundUsdt(bal + balanceDeltaTotal) : bal,
      );
    }
  }

  return { settled, wins, losses, balanceDelta: balanceDeltaTotal };
}

/** Pf_SettleOpenOrders — 主动结算已 RESOLVED 市场的未结单 */
export async function handlePfSettleOpenOrders(body, userId) {
  const gate = await assertPfPlayer(body, userId, { requireHouse: false });
  if (!gate.ok)
    return gate;
  try {
    const stats = await settleResolvedPfOrdersForPlayer(gate.playerId, userId);
    const owned = await assertPlayerOwnedByUser(gate.playerId, userId);
    const player = owned.ok ? owned.player : gate.player;
    const balance = await resolvePfBalance(player, userId, gate.playerId);
    const published = await publishPfBalance(gate.playerId, userId, balance);
    return {
      ok: true,
      info: {
        ...stats,
        balance: published.ok ? published.info.balance : balance,
        totalProfit: published.ok ? published.info.totalProfit : undefined,
        unsettle: published.ok ? published.info.unsettle : undefined,
        playerId: gate.playerId,
      },
    };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/** Pf_GetOrder — 官方 GET /v1/orders/{hash} + 拒单退款 */
export async function handlePfGetOrder(body, userId) {
  const gate = await assertPfPlayer(body, userId);
  if (!gate.ok)
    return gate;

  const orderId = String(body?.orderId ?? body?.hash ?? "").trim();
  if (!orderId)
    return { ok: false, msg: "orderId 必填" };

  try {
    const list = await loadPfOrders(gate.playerId, userId);
    const rdsRow = list.find(row => {
      const id = rdsOrderKey(row);
      const hash = rdsPfHash(row);
      const apiId = rdsPfApiOrderId(row);
      return id === orderId || hash === orderId || (apiId && apiId === orderId);
    }) ?? null;

    const official = await lookupOfficialOrder(rdsRow, orderId);

    if (!official) {
      const venueOrder = rdsRow
        ? mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow))
        : null;
      return {
        ok: true,
        info: {
          orderId,
          found: false,
          settlement: "timeout",
          order: venueOrder,
          official: null,
          refunded: false,
        },
      };
    }

    const synced = rdsRow
      ? await syncOfficialOrderToRds(gate.playerId, userId, rdsRow, official)
      : {
        venueOrder: mapPredictOrderToVenueOrder(official, { orderId }),
        refunded: false,
        settlement: settlementFromPredictOfficialStatus(official.status),
      };

    return {
      ok: true,
      info: {
        orderId: synced.venueOrder.orderId || orderId,
        found: true,
        settlement: synced.settlement,
        order: synced.venueOrder,
        officialStatus: official.status,
        official,
        refunded: synced.refunded,
      },
    };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pf_GetOrders — 对本玩家 RDS 订单逐条按 hash 对齐官方状态（含拒单退款）
 * 官方列表 filter 仅 OPEN/FILLED，故未结单须逐条 Get-by-hash。
 */
export async function handlePfGetOrders(body, userId) {
  const gate = await assertPfPlayer(body, userId);
  if (!gate.ok)
    return gate;

  try {
    const list = await loadPfOrders(gate.playerId, userId);
    const orders = [];
    let refundedCount = 0;

    for (const rdsRow of list) {
      const hash = rdsPfHash(rdsRow);
      if (!hash) {
        orders.push(mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow)));
        continue;
      }

      // 已终态（Win/Lose/Reject）不再打官方，避免限流
      const st = String(rdsOrderStatus(rdsRow)).toLowerCase();
      if (st === "win" || st === "lose" || st === "reject" || st === "return") {
        orders.push(mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow)));
        continue;
      }

      try {
        const official = await lookupOfficialOrder(rdsRow, hash);
        if (!official) {
          orders.push(mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow)));
          continue;
        }
        const synced = await syncOfficialOrderToRds(gate.playerId, userId, rdsRow, official);
        if (synced.refunded)
          refundedCount += 1;
        orders.push(synced.venueOrder);
      }
      catch (err) {
        console.warn("[Pf_GetOrders] hash lookup failed", hash, err);
        orders.push(mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow)));
      }
    }

    orders.sort((a, b) => (Number(b.createAt) || 0) - (Number(a.createAt) || 0));

    let settleStats = { settled: 0, wins: 0, losses: 0 };
    try {
      settleStats = await settleResolvedPfOrdersForPlayer(gate.playerId, userId);
      if (settleStats.settled > 0) {
        // 结算后重载列表，保证返回含 Win/Lose
        const refreshed = await loadPfOrders(gate.playerId, userId);
        orders.length = 0;
        for (const rdsRow of refreshed) {
          orders.push(mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow)));
        }
        orders.sort((a, b) => (Number(b.createAt) || 0) - (Number(a.createAt) || 0));
      }
    }
    catch (err) {
      console.warn("[Pf_GetOrders] settle skipped", err);
    }

    return {
      ok: true,
      info: {
        orders,
        refundedCount,
        settledCount: settleStats.settled,
        playerId: gate.playerId,
      },
    };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pf_SubmitSell — 1:1 全卖指定买单（house SELL FOK）
 * body: { playerId, buyOrderId }
 */
export async function handlePfSubmitSell(body, userId) {
  const gate = await assertPfPlayer(body, userId);
  if (!gate.ok)
    return gate;

  const buyOrderId = String(body?.buyOrderId ?? body?.orderId ?? "").trim();
  if (!buyOrderId)
    return { ok: false, msg: "buyOrderId 必填" };

  try {
    const sold = await withHouseOrderLock(async () => {
      const list = await loadPfOrders(gate.playerId, userId);
      const buy = list.find((row) => {
        const id = rdsOrderKey(row);
        const hash = rdsPfHash(row);
        return id === buyOrderId || hash === buyOrderId;
      });
      if (!buy)
        throw new Error("找不到对应买单");
      if (String(buy.pfSide ?? "").toLowerCase() === "sell")
        throw new Error("不能对卖单再卖");
      if (String(buy.pfSellState ?? "").toLowerCase() === "closed")
        throw new Error("该买单已卖出");
      const st = String(rdsOrderStatus(buy)).toLowerCase();
      if (st === "reject" || st === "return" || st === "pending")
        throw new Error("买单尚未确认成交或已拒单，不能卖出");
      if (st === "win" || st === "lose")
        throw new Error("买单已到期结算，不能卖出");

      const marketId = String(buy.pfMarketId ?? buy.Match ?? buy.match ?? "").trim();
      const tokenId = String(buy.pfTokenId ?? buy.Item ?? buy.item ?? "").trim();
      if (!marketId || !tokenId)
        throw new Error("买单缺少 marketId/tokenId");

      let sharesWei = buy.pfSharesWei ? BigInt(String(buy.pfSharesWei)) : 0n;
      if (sharesWei <= 0n) {
        const bookPrice = Number(buy.pfBookPrice) || (Number(buy.Odds || buy.odds) > 1
          ? 1 / Number(buy.Odds || buy.odds)
          : 0);
        sharesWei = estimatePfSharesWei(rdsBetMoney(buy), bookPrice);
      }
      if (sharesWei <= 0n)
        throw new Error("无法解析买单份额");

      const market = await fetchPredictMarket(marketId);
      const tradable = assertPredictMarketTradable(market);
      if (!tradable.ok)
        throw new Error(tradable.msg);

      const out = await createAndSubmitHouseMarketSell({
        tokenId,
        marketId,
        sharesWei,
        feeRateBps: Number(market?.feeRateBps ?? 0) || 0,
        isNegRisk: Boolean(market?.isNegRisk),
        isYieldBearing: Boolean(market?.isYieldBearing),
      });

      if (!isPredictFunOrderAccepted(out.result)) {
        const code = String(out.result?.data?.code ?? "").trim();
        throw new Error(code
          ? `Predict.fun 卖出未受理（code: ${code}）`
          : "Predict.fun FOK 卖出未成交");
      }

      const sellHash = String(out.requestBody?.data?.order?.hash ?? "").trim();
      const sellApiId = String(out.result?.data?.orderId ?? "").trim();
      const sellOrderId = sellHash || sellApiId;
      if (!sellHash)
        throw new Error("卖出缺少 order hash，无法确认成交");

      const official = await waitForHouseOrderTerminal(sellHash);
      const settlement = settlementFromPredictOfficialStatus(official?.status);
      if (settlement !== "filled") {
        const st = String(official?.status ?? "timeout").toUpperCase();
        throw new Error(
          settlement === "unfilled"
            ? `Predict.fun 卖出未成交（${st}）`
            : `Predict.fun 卖出确认超时（status=${st}）`,
        );
      }

      const fill = extractSellFill(official, {
        fallbackProceedsUsdt: out.proceedsUsdt,
        fallbackSharesWei: sharesWei,
      });
      const proceeds = roundUsdt(fill.proceedsUsdt);
      const filledSharesWei = fill.sharesWei > 0n ? fill.sharesWei : sharesWei;
      const stake = rdsBetMoney(buy);
      const profit = roundUsdt(proceeds - stake);
      const sellOdds = Number(out.bookOdds) || 0;
      const createAt = Date.now();

      await orderStore.saveOrder(gate.playerId, [
        {
          orderId: rdsOrderKey(buy),
          provider: "PredictFun",
          match: marketId,
          bet: "PredictFun",
          item: tokenId,
          odds: Number(buy.Odds ?? buy.odds) || 0,
          betMoney: stake,
          money: profit,
          status: "none",
          createAt: Number(buy.CreateAt ?? buy.createAt) || createAt,
          link: buy.Link ?? buy.link,
          pfMarketId: marketId,
          pfTokenId: tokenId,
          pfOrderHash: rdsPfHash(buy),
          pfApiOrderId: rdsPfApiOrderId(buy),
          pfSharesWei: String(filledSharesWei),
          pfShares: weiToDecimal18(filledSharesWei),
          pfBookPrice: buy.pfBookPrice,
          pfSide: "buy",
          pfSellState: "closed",
          pfSellOrderId: sellOrderId,
          pfSellProceeds: proceeds,
          pfAmountFilled: fill.amountFilledRaw,
        },
        {
          orderId: sellOrderId,
          provider: "PredictFun",
          match: marketId,
          bet: "PredictFun",
          item: tokenId,
          odds: sellOdds,
          betMoney: proceeds,
          money: 0,
          status: "none",
          createAt,
          link: buy.Link ?? buy.link,
          pfMarketId: marketId,
          pfTokenId: tokenId,
          pfOrderHash: sellHash,
          pfApiOrderId: sellApiId,
          pfSharesWei: String(filledSharesWei),
          pfShares: weiToDecimal18(filledSharesWei),
          pfBookPrice: out.bookPrice,
          pfSide: "sell",
          pfBuyOrderId: rdsOrderKey(buy),
          pfSellState: "closed",
          pfOfficialStatus: official?.status,
          pfAmountFilled: fill.amountFilledRaw,
        },
      ], userId, "PredictFun");

      const owned = await assertPlayerOwnedByUser(gate.playerId, userId);
      if (!owned.ok)
        throw new Error(owned.msg || "账号校验失败");
      const bal = await resolvePfBalance(owned.player, userId, gate.playerId);
      const published = await publishPfBalance(
        gate.playerId,
        userId,
        roundUsdt(bal + proceeds),
      );

      return {
        buyOrderId: rdsOrderKey(buy),
        sellOrderId,
        shares: weiToDecimal18(filledSharesWei),
        proceedsUsdt: proceeds,
        profit,
        bookPrice: out.bookPrice,
        bookOdds: sellOdds,
        balance: published.ok ? published.info.balance : roundUsdt(bal + proceeds),
        totalProfit: published.ok ? published.info.totalProfit : undefined,
        officialStatus: official?.status,
      };
    });

    return { ok: true, info: { ...sold, playerId: gate.playerId } };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pf_HouseRedeemResolved — 管理员：主号 redeem 已 RESOLVED 仓位（回笼 USDT）
 * body: { marketId? }
 */
export async function handlePfHouseRedeemResolved(body, userId) {
  if (!userId)
    return { ok: false, msg: "请先登录" };
  if (!isPredictFunHouseConfigured())
    return { ok: false, msg: "VPS 未配置 Predict.fun 主号" };
  try {
    const marketId = body?.marketId != null ? String(body.marketId).trim() : "";
    const result = await redeemHouseResolvedPositions({
      marketId: marketId || undefined,
      force: Boolean(body?.force),
    });
    return { ok: true, info: result };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}
