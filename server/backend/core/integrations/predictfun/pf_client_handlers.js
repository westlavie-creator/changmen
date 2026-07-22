/**
 * Predict.fun 语义 API：Pf_CheckBet / Pf_SubmitOrder / Pf_GetOrder / Pf_GetOrders / Pf_RefreshBalance
 *
 * 中转模型：用户 ↔ changmen 账本 ↔ PF 官网（house）。
 * 用户可见生命周期见 `pf_lifecycle.js`（仅 pending/open/closed/settled/reject）。
 * `closing` / `pending_credit` 仅为崩溃恢复标记，不进入用户 DTO。
 *
 * 会员余额真相：`players.total_balance`（不用 A8 credit）。
 * 订单确认：官方 GET /v1/orders/{hash}（JWT）；拒单退还 stake。
 */

import { assertPlayerOwnedByUser, isPredictFunPlayerRow } from "../../account/player_ownership.js";
import { isPredictFunHouseConfigured, resolvePfHouseMaxStakeUsdt } from "./house_credentials.js";
import {
  assertPfAvailableBalance,
} from "./pf_ledger.js";
import {
  estimateHouseMarketBuyMakerUsdt,
  isValidPredictClobPrice,
  resolveExecutableBuy,
  withHouseOrderLock,
} from "./pf_order_service.js";
import {
  loadPfOrders,
  publishPfBalanceKnown,
  resolvePfBalance,
  retryPendingPfLedgerCredits,
} from "./pf_player_account.js";
import {
  findPfOrderInList,
  rdsOrderStatus,
  rdsPfHash,
  rdsToMapInput,
} from "./pf_order_row.js";
import { syncOfficialOrderToRds, lookupOfficialOrder } from "./pf_sync_official.js";
import { preparePfBuyOutsideLock, executePfBuyInLock } from "./pf_exec_buy.js";
import { executePfSellInLock } from "./pf_exec_sell.js";
import { settleResolvedPfOrdersForPlayer } from "./pf_exec_settle.js";
import { redeemHouseResolvedPositions } from "./pf_house_redeem.js";
import { mapPredictOrderToVenueOrder } from "./pf_orders.js";
import {
  listPfStuckOrdersForPlayer,
  recoverPfStuckOrdersForPlayer,
} from "./pf_recover_stuck.js";
import {
  toUserPfGetOrderInfo,
  toUserPfSubmitOrderInfo,
  toUserPfSubmitSellInfo,
  toUserPfVenueOrders,
} from "./pf_user_dto.js";

export { settleResolvedPfOrdersForPlayer };
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
    display: {
      match: String(body?.match ?? body?.Match ?? "").trim(),
      bet: String(body?.bet ?? body?.Bet ?? "").trim(),
      item: String(body?.item ?? body?.Item ?? "").trim(),
    },
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

  if (!isPredictFunPlayerRow(owned.player))
    return { ok: false, msg: `playerId ${pid.playerId} 不是 PredictFun 账号` };

  return { ok: true, playerId: pid.playerId, player: owned.player };
}

/** Pf_RefreshBalance — 读 total_balance；顺带结算 + 卡住订单补偿 */
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
    try {
      const stuck = await recoverPfStuckOrdersForPlayer(gate.playerId, userId);
      if (stuck.closing.some(r => !r.ok))
        console.warn("[Pf_RefreshBalance] closing recover partial", stuck.closing);
    }
    catch (err) {
      console.warn("[Pf_RefreshBalance] stuck recover skipped", err);
    }
    const owned = await assertPlayerOwnedByUser(gate.playerId, userId);
    const player = owned.ok ? owned.player : gate.player;
    const balance = await resolvePfBalance(player, userId, gate.playerId);
    // 禁止绝对值 SET：仅同步 KV/统计，避免与并发 debit 竞态把余额写回去
    return await publishPfBalanceKnown(gate.playerId, userId, balance);
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
    const resolved = await resolveExecutableBuy({
      tokenId: intent.tokenId,
      marketId: intent.marketId,
      detectionOdds: intent.detectionOdds,
      maxPrice: intent.detectionMaxPrice,
      apiBetMoney: intent.apiBetMoney,
    });
    // 名义 maker 可高于 apiBetMoney；预检按名义验余额，与提交扣款一致
    const est = await estimateHouseMarketBuyMakerUsdt({
      tokenId: intent.tokenId,
      marketId: intent.marketId,
      apiBetMoney: intent.apiBetMoney,
      maxPrice: intent.detectionMaxPrice,
      maxSlippageBps: intent.slippageBps,
      yesBook: resolved.yesBook,
      market: resolved.market,
    });
    const chargeUsdt = Math.max(intent.apiBetMoney, Number(est.makerUsdt) || 0);
    const maxStake = resolvePfHouseMaxStakeUsdt();
    if (chargeUsdt > maxStake + 1e-9)
      return { ok: false, msg: `单笔名义超过上限 ${maxStake} USDT（名义 ${roundUsdt(chargeUsdt)}）` };
    const avail = assertPfAvailableBalance(balance, chargeUsdt, { label: "名义" });
    if (!avail.ok)
      return avail;

    return {
      ok: true,
      info: {
        tokenId: intent.tokenId,
        marketId: intent.marketId,
        apiBetMoney: intent.apiBetMoney,
        makerUsdt: est.makerUsdt,
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
    const softAvail = assertPfAvailableBalance(balanceBefore, intent.apiBetMoney);
    if (!softAvail.ok)
      return softAvail;

    console.info(
      `[Pf_SubmitOrder] start player=${gate.playerId} market=${intent.marketId} stake=${intent.apiBetMoney}`,
    );

    const prepared = await preparePfBuyOutsideLock(intent, balanceBefore);
    if (!prepared.ok)
      return prepared;

    const submitted = await withHouseOrderLock(() => executePfBuyInLock({
      playerId: gate.playerId,
      userId,
      intent,
      fresh0: prepared.fresh0,
      chargeUsdt: prepared.chargeUsdt,
    }));
    console.info(`[Pf_SubmitOrder] lock_done player=${gate.playerId} market=${intent.marketId}`);

    return {
      ok: true,
      info: toUserPfSubmitOrderInfo({
        orderId: submitted.orderId,
        code: submitted.out.result?.data?.code ?? null,
        bookPrice: submitted.out.bookPrice || submitted.fresh.bookPrice,
        bookOdds: submitted.bookOdds || submitted.out.bookOdds || submitted.fresh.bookOdds,
        playerId: gate.playerId,
        pending: true,
        balance: submitted.published.ok ? submitted.published.info.balance : submitted.balance,
        totalProfit: submitted.published.ok ? submitted.published.info.totalProfit : undefined,
      }),
    };
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Pf_SubmitOrder] fail market=${intent?.marketId || "?"} ${msg}`);
    return { ok: false, msg };
  }
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
    const published = await publishPfBalanceKnown(gate.playerId, userId, balance);
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

/** Pf_GetOrder — 对齐本人 RDS 订单后返回 changmen 处理结果（不含官网原文） */
export async function handlePfGetOrder(body, userId) {
  const gate = await assertPfPlayer(body, userId);
  if (!gate.ok)
    return gate;

  const orderId = String(body?.orderId ?? body?.hash ?? "").trim();
  if (!orderId)
    return { ok: false, msg: "orderId 必填" };

  try {
    try {
      await retryPendingPfLedgerCredits(gate.playerId, userId);
    }
    catch (err) {
      console.warn("[Pf_GetOrder] pending credit retry skipped", err);
    }

    const list = await loadPfOrders(gate.playerId, userId);
    const rdsRow = findPfOrderInList(list, orderId);

    // 用户只认 changmen RDS：无本人订单则拒绝，禁止 house 代查任意 hash
    if (!rdsRow) {
      return { ok: false, msg: "订单不存在或不属于当前账号" };
    }

    const official = await lookupOfficialOrder(rdsRow, orderId);

    if (!official) {
      const venueOrder = mapPredictOrderToVenueOrder(null, rdsToMapInput(rdsRow));
      return {
        ok: true,
        info: toUserPfGetOrderInfo({
          orderId,
          found: false,
          settlement: "timeout",
          order: venueOrder,
          refunded: false,
        }),
      };
    }

    const synced = await syncOfficialOrderToRds(gate.playerId, userId, rdsRow, official);

    return {
      ok: true,
      info: toUserPfGetOrderInfo({
        orderId: synced.venueOrder.orderId || orderId,
        found: true,
        settlement: synced.settlement,
        order: synced.venueOrder,
        refunded: synced.refunded,
      }),
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
        orders: toUserPfVenueOrders(orders),
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
    const sold = await withHouseOrderLock(() => executePfSellInLock({
      playerId: gate.playerId,
      userId,
      buyOrderId,
    }));
    return { ok: true, info: toUserPfSubmitSellInfo({ ...sold, playerId: gate.playerId }) };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}

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

/**
 * Pf_RecoverStuckOrders — 列出或补偿 pending_credit / closing
 * body: { playerId, dryRun?: boolean }
 */
export async function handlePfRecoverStuckOrders(body, userId) {
  const dryRun = Boolean(body?.dryRun);
  const gate = await assertPfPlayer(body, userId, { requireHouse: !dryRun });
  if (!gate.ok)
    return gate;
  try {
    if (body?.dryRun) {
      const listed = await listPfStuckOrdersForPlayer(gate.playerId, userId);
      return {
        ok: true,
        info: {
          dryRun: true,
          playerId: gate.playerId,
          ...listed,
        },
      };
    }
    const recovered = await recoverPfStuckOrdersForPlayer(gate.playerId, userId);
    return {
      ok: true,
      info: {
        dryRun: false,
        playerId: gate.playerId,
        pendingCredit: recovered.pendingCredit,
        closing: recovered.closing.map((row) => ({
          buyOrderId: row.buyOrderId,
          ok: row.ok,
          msg: row.msg,
          sellOrderId: row.info?.sellOrderId,
          proceedsUsdt: row.info?.proceedsUsdt,
        })),
      },
    };
  }
  catch (err) {
    return { ok: false, msg: err instanceof Error ? err.message : String(err) };
  }
}
