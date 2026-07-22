/**
 * PredictFun 买入执行：锁外报价 + 锁内 debit→官网→落单
 */

import * as accountStore from "../../account/account_store.js";
import { assertPlayerOwnedByUser } from "../../account/player_ownership.js";
import { changmenCodeFeeSavePatch } from "./pf_changmen_code_fee.js";
import { resolvePfHouseMaxStakeUsdt, resolvePfChangmenBuyFeeRateBps } from "./house_credentials.js";
import { assertPfAvailableBalance, roundUsdt } from "./pf_ledger.js";
import {
  createAndSubmitHouseMarketBuy,
  estimateHouseMarketBuyMakerUsdt,
  isPredictFunOrderAccepted,
  prepareHouseSigner,
  resolveExecutableBuy,
  REUSE_BOOK_MAX_AGE_MS,
  weiToDecimal18,
} from "./pf_order_service.js";
import { extractBuyNotionalUsdt } from "./pf_fill.js";
import { resolvePfOrderLabels } from "./pf_order_labels.js";
import { publishPfBalanceKnown, resolvePfBalance } from "./pf_player_account.js";
import { upsertPfServerOrder } from "./pf_server_order.js";

/**
 * 锁外：拉盘 + 估算名义 chargeUsdt
 * @returns {{ ok: true, fresh0: object, chargeUsdt: number } | { ok: false, msg: string }}
 */
export async function preparePfBuyOutsideLock(intent, balanceBefore) {
  const [fresh0] = await Promise.all([
    resolveExecutableBuy({
      tokenId: intent.tokenId,
      marketId: intent.marketId,
      detectionOdds: intent.detectionOdds,
      maxPrice: intent.detectionMaxPrice,
      apiBetMoney: intent.apiBetMoney,
    }),
    prepareHouseSigner(),
  ]);

  const est0 = await estimateHouseMarketBuyMakerUsdt({
    tokenId: intent.tokenId,
    marketId: intent.marketId,
    apiBetMoney: intent.apiBetMoney,
    maxPrice: intent.detectionMaxPrice,
    maxSlippageBps: intent.slippageBps,
    yesBook: fresh0.yesBook,
    market: fresh0.market,
  });
  const chargeUsdt = Math.max(intent.apiBetMoney, Number(est0.makerUsdt) || 0);
  const maxStake = resolvePfHouseMaxStakeUsdt();
  if (chargeUsdt > maxStake + 1e-9)
    return { ok: false, msg: `单笔名义超过上限 ${maxStake} USDT（名义 ${roundUsdt(chargeUsdt)}）` };
  const notionalAvail = assertPfAvailableBalance(balanceBefore, chargeUsdt, { label: "名义" });
  if (!notionalAvail.ok)
    return notionalAvail;

  return { ok: true, fresh0, chargeUsdt };
}

/**
 * 锁内：debit → 官网 FOK → 轧差 → Pending 落库
 * @throws {Error}
 */
export async function executePfBuyInLock({ playerId, userId, intent, fresh0, chargeUsdt }) {
  const owned = await assertPlayerOwnedByUser(playerId, userId);
  if (!owned.ok)
    throw new Error(owned.msg || "账号校验失败");
  const liveBal = await resolvePfBalance(owned.player, userId, playerId);
  const liveAvail = assertPfAvailableBalance(liveBal, chargeUsdt, { label: "名义" });
  if (!liveAvail.ok)
    throw new Error(liveAvail.msg || "可用余额不足");

  const reserved = await accountStore.debitPlayerBalance(playerId, chargeUsdt, userId);
  if (!reserved)
    throw new Error("可用余额不足（并发扣款未成功）");

  let fresh = fresh0;
  if (Date.now() - Number(fresh0.bookFetchedAt || 0) > REUSE_BOOK_MAX_AGE_MS) {
    fresh = await resolveExecutableBuy({
      tokenId: intent.tokenId,
      marketId: intent.marketId,
      detectionOdds: intent.detectionOdds,
      maxPrice: intent.detectionMaxPrice,
      apiBetMoney: intent.apiBetMoney,
    });
  }

  let out;
  try {
    out = await createAndSubmitHouseMarketBuy({
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
      availableBalance: liveBal,
    });
  }
  catch (submitErr) {
    await accountStore.creditPlayerBalance(playerId, chargeUsdt, userId);
    throw submitErr;
  }

  if (!isPredictFunOrderAccepted(out.result)) {
    await accountStore.creditPlayerBalance(playerId, chargeUsdt, userId);
    const code = String(out.result?.data?.code ?? "").trim();
    throw new Error(code
      ? `Predict.fun 下单未受理（code: ${code}）`
      : "Predict.fun FOK 订单未成交");
  }

  const pfOrderHash = String(out.requestBody?.data?.order?.hash ?? "").trim();
  const pfApiOrderId = String(out.result.data?.orderId ?? "").trim();
  const orderId = pfOrderHash || pfApiOrderId;
  const bookOdds = Number(out.bookOdds || fresh.bookOdds) || 0;
  const createAt = Date.now();
  const sharesWei = String(out.sharesWei ?? "").trim();
  const shares = Number(out.shares) || (sharesWei ? weiToDecimal18(sharesWei) : 0);
  const labels = resolvePfOrderLabels({
    marketId: intent.marketId,
    tokenId: intent.tokenId,
    fromClient: intent.display,
  });
  const bookPrice = Number(out.bookPrice || fresh.bookPrice) || 0;
  const notional = Number(out.makerUsdt) > 0
    ? roundUsdt(out.makerUsdt)
    : extractBuyNotionalUsdt(null, {
        shares: shares > 0 ? shares : undefined,
        bookPrice: bookPrice > 0 ? bookPrice : undefined,
        fallbackUsdt: intent.apiBetMoney,
      });
  const userStake = Number(notional) > 0 ? roundUsdt(notional) : intent.apiBetMoney;

  let balanceAfter = reserved.total;
  let settledStake = userStake;
  if (userStake > chargeUsdt + 1e-9) {
    const extra = roundUsdt(userStake - chargeUsdt);
    const more = await accountStore.debitPlayerBalance(playerId, extra, userId);
    if (!more) {
      console.warn(
        `[Pf_SubmitOrder] extra debit failed after accept order=${orderId} stake=${userStake} reserved=${chargeUsdt}`,
      );
      settledStake = chargeUsdt;
    }
    else {
      balanceAfter = more.total;
    }
  }
  else if (userStake < chargeUsdt - 1e-9) {
    const refund = roundUsdt(chargeUsdt - userStake);
    const credited = await accountStore.creditPlayerBalance(playerId, refund, userId);
    if (credited)
      balanceAfter = credited.total;
  }

  const buyFeeBps = resolvePfChangmenBuyFeeRateBps();
  const changmenBuyPatch = changmenCodeFeeSavePatch({
    rateBps: buyFeeBps > 0 ? buyFeeBps : undefined,
  });

  const pendingRow = {
    orderId,
    provider: "PredictFun",
    match: labels.match,
    bet: labels.bet,
    item: labels.item,
    odds: bookOdds,
    betMoney: settledStake,
    money: 0,
    status: "Pending",
    createAt,
    pfMarketId: intent.marketId,
    pfTokenId: intent.tokenId,
    pfBookPrice: bookPrice > 0 ? bookPrice : (out.bookPrice || fresh.bookPrice),
    pfNotionalUsdt: settledStake,
    pfOrderHash,
    pfApiOrderId,
    pfSharesWei: sharesWei || undefined,
    pfShares: shares > 0 ? shares : undefined,
    pfSide: "buy",
    pfSellState: "open",
    pfFeeRateBps: Number(fresh.feeRateBps ?? out.feeRateBps) >= 0
      ? Number(fresh.feeRateBps ?? out.feeRateBps)
      : undefined,
    ...changmenBuyPatch,
  };
  const saved = await upsertPfServerOrder(playerId, [pendingRow], userId);
  if (!saved) {
    const savedRetry = await upsertPfServerOrder(playerId, [pendingRow], userId);
    if (!savedRetry)
      throw new Error("订单落库失败（已扣款且官网已受理，请联系客服核对）");
  }

  const published = await publishPfBalanceKnown(playerId, userId, balanceAfter);
  return {
    fresh,
    out,
    orderId,
    bookOdds,
    userStake: settledStake,
    published,
    balance: balanceAfter,
  };
}
