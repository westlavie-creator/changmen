/**
 * PredictFun 卖出执行：锁内门控 → 官网 SELL → closing → fee → closed + pending_credit
 */

import { assertPlayerOwnedByUser } from "../../account/player_ownership.js";
import {
  changmenCodeFeeSavePatch,
  readChangmenCodeFeeRateBps,
  readChangmenCodeFeeShares,
  readChangmenCodeFeeUsdt,
} from "./pf_changmen_code_fee.js";
import { resolvePfChangmenSellFeeRateBps } from "./house_credentials.js";
import { roundUsdt } from "./pf_ledger.js";
import {
  evaluatePfBuyForSell,
  readPfPendingCreditUsdt,
} from "./pf_lifecycle.js";
import {
  applyPendingPfLedgerCredit,
  loadPfOrders,
  publishPfBalanceKnown,
  resolvePfBalance,
} from "./pf_player_account.js";
import {
  findPfOrderInList,
  rdsBetMoney,
  rdsOrderKey,
  rdsPfApiOrderId,
  rdsPfHash,
} from "./pf_order_row.js";
import {
  createAndSubmitHouseMarketSell,
  decimal18ToWei,
  isPredictFunOrderAccepted,
  weiToDecimal18,
} from "./pf_order_service.js";
import { fetchPredictMarket } from "./pf_api.js";
import { extractSellFill } from "./pf_fill.js";
import {
  netSellProceedsAfterChangmenFee,
  netSellProceedsAfterCollateralFee,
  resolvePfFeeSavePatch,
} from "./pf_fee.js";
import { assertPredictMarketTradable } from "./pf_market_guard.js";
import {
  settlementFromPredictOfficialStatus,
  waitForHouseOrderTerminal,
  awaitHouseOrderFee,
} from "./pf_orders.js";
import { pfSellItemLabel, resolvePfOrderLabels } from "./pf_order_labels.js";
import { upsertPfServerOrder } from "./pf_server_order.js";

/**
 * 锁内卖出（含 resume_credit / resume_closing）
 * @throws {Error}
 */
export async function executePfSellInLock({ playerId, userId, buyOrderId }) {
  const list = await loadPfOrders(playerId, userId);
  const buy = findPfOrderInList(list, buyOrderId);
  const gateSell = evaluatePfBuyForSell(buy);
  if (!gateSell.ok)
    throw new Error(gateSell.msg);

  if (gateSell.action === "resume_credit") {
    const creditResult = await applyPendingPfLedgerCredit(playerId, userId, buy);
    if (!creditResult.ok)
      throw new Error("回款入账失败，请稍后重试");
    const proceeds = Number(buy.pfSellProceeds) > 0
      ? roundUsdt(buy.pfSellProceeds)
      : readPfPendingCreditUsdt(buy);
    const stake = rdsBetMoney(buy);
    return {
      buyOrderId: rdsOrderKey(buy),
      sellOrderId: String(buy.pfSellOrderId ?? "").trim() || rdsOrderKey(buy),
      shares: Number(buy.pfHoldShares) > 0 ? Number(buy.pfHoldShares) : undefined,
      proceedsUsdt: proceeds,
      profit: roundUsdt(proceeds - stake),
      bookPrice: Number(buy.pfBookPrice) || 0,
      bookOdds: Number(buy.Odds ?? buy.odds) || 0,
      balance: creditResult.balance,
      totalProfit: undefined,
      resumedCredit: true,
    };
  }

  const resumeClosing = gateSell.action === "resume_closing";
  const resumeSellHash = resumeClosing ? gateSell.sellHash : "";
  const marketId = resumeClosing
    ? String(buy.pfMarketId ?? buy.Match ?? buy.match ?? "").trim()
    : gateSell.marketId;
  const tokenId = resumeClosing
    ? String(buy.pfTokenId ?? buy.Item ?? buy.item ?? "").trim()
    : gateSell.tokenId;
  const holdShares = resumeClosing
    ? Number(buy.pfHoldShares)
    : gateSell.holdShares;
  if (!(Number.isFinite(holdShares) && holdShares > 0))
    throw new Error("持仓未就绪，请稍后重试 GetOrder 后再卖");
  if (!marketId || !tokenId)
    throw new Error("买单缺少 marketId/tokenId");

  let sharesWei = 0n;
  try {
    sharesWei = decimal18ToWei(holdShares);
  }
  catch {
    sharesWei = 0n;
  }
  if (sharesWei <= 0n)
    throw new Error("持仓份额无效，无法卖出");

  const market = await fetchPredictMarket(marketId);
  const tradable = assertPredictMarketTradable(market);
  if (!tradable.ok)
    throw new Error(tradable.msg);

  let sellHash = resumeClosing ? resumeSellHash : "";
  let sellOrderId = sellHash;
  let sellApiId = "";
  let out = {
    bookPrice: Number(buy.pfBookPrice) || 0,
    bookOdds: Number(buy.Odds ?? buy.odds) || 0,
    proceedsUsdt: 0,
  };
  let officialFilled = null;

  if (!resumeClosing) {
    out = await createAndSubmitHouseMarketSell({
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

    sellHash = String(out.requestBody?.data?.order?.hash ?? "").trim();
    sellApiId = String(out.result?.data?.orderId ?? "").trim();
    sellOrderId = sellHash || sellApiId;
    if (!sellHash)
      throw new Error("卖出缺少 order hash，无法确认成交");

    officialFilled = await waitForHouseOrderTerminal(sellHash);
    const settlement = settlementFromPredictOfficialStatus(officialFilled?.status);
    if (settlement !== "filled") {
      const st = String(officialFilled?.status ?? "timeout").toUpperCase();
      throw new Error(
        settlement === "unfilled"
          ? `Predict.fun 卖出未成交（${st}）`
          : `Predict.fun 卖出确认超时（status=${st}）`,
      );
    }

    const closingSaved = await upsertPfServerOrder(playerId, [{
      orderId: rdsOrderKey(buy),
      provider: "PredictFun",
      match: buy.match ?? buy.Match,
      bet: buy.bet ?? buy.Bet,
      item: buy.item ?? buy.Item,
      odds: Number(buy.Odds ?? buy.odds) || 0,
      betMoney: rdsBetMoney(buy),
      money: Number(buy.Money ?? buy.money) || 0,
      status: "none",
      createAt: Number(buy.CreateAt ?? buy.createAt) || Date.now(),
      link: buy.Link ?? buy.link,
      pfMarketId: marketId,
      pfTokenId: tokenId,
      pfOrderHash: rdsPfHash(buy),
      pfApiOrderId: rdsPfApiOrderId(buy),
      pfSharesWei: buy.pfSharesWei ? String(buy.pfSharesWei) : undefined,
      pfShares: Number(buy.pfShares) > 0 ? Number(buy.pfShares) : undefined,
      pfHoldShares: holdShares,
      pfBookPrice: buy.pfBookPrice,
      pfSide: "buy",
      pfSellState: "closing",
      pfSellOrderId: sellOrderId,
      pfNotionalUsdt: buy.pfNotionalUsdt,
      ...changmenCodeFeeSavePatch({
        rateBps: readChangmenCodeFeeRateBps(buy),
        shares: readChangmenCodeFeeShares(buy),
        usdt: readChangmenCodeFeeUsdt(buy),
      }),
      // Phase 1：closing 即写入事件（fee 完成后 closed 同 id 幂等更新 proceeds）
      positionEvents: {
        sells: [{
          id: sellOrderId,
          at: Date.now(),
          shares: holdShares,
          price: Number(out.bookPrice) > 0 ? Number(out.bookPrice) : undefined,
          proceeds: Number(out.proceedsUsdt) > 0 ? roundUsdt(out.proceedsUsdt) : 0,
          origin: "changmen",
          status: "closing",
        }],
      },
    }], userId);
    if (!closingSaved)
      throw new Error("卖出状态落库失败（closing）");
  }
  else {
    officialFilled = await waitForHouseOrderTerminal(sellHash);
    const settlement = settlementFromPredictOfficialStatus(officialFilled?.status);
    if (settlement !== "filled") {
      throw new Error(`卖出恢复失败：官方状态 ${String(officialFilled?.status ?? "timeout")}`);
    }
  }

  const feeRateBps = Number(market?.feeRateBps ?? 0) || 0;
  let official;
  try {
    official = await awaitHouseOrderFee(officialFilled, sellHash, {
      feeRateBps,
      timeoutMs: 15_000,
    });
  }
  catch (feeErr) {
    throw new Error(
      feeErr instanceof Error
        ? `${feeErr.message}（卖出已成交，状态 closing，请稍后重试卖出以补齐）`
        : "卖出确认超时，请稍后重试",
    );
  }

  const fill = extractSellFill(official, {
    fallbackProceedsUsdt: out.proceedsUsdt,
    fallbackSharesWei: sharesWei,
  });
  const sellFeePatch = resolvePfFeeSavePatch(official, null);
  if (feeRateBps > 0 && !String(sellFeePatch.pfFeeAmountWei ?? "").trim())
    throw new Error("卖出确认超时，请稍后重试");

  const afterOfficial = netSellProceedsAfterCollateralFee(fill.proceedsUsdt, sellFeePatch);
  const changmenBps = resolvePfChangmenSellFeeRateBps();
  const {
    proceedsUsdt: proceedsRaw,
    changmenCodeFeeUsdt,
    changmenCodeFeeRateBps,
  } = netSellProceedsAfterChangmenFee(afterOfficial, changmenBps);
  const proceeds = roundUsdt(proceedsRaw);
  const filledSharesWei = fill.sharesWei > 0n ? fill.sharesWei : sharesWei;
  const stake = rdsBetMoney(buy);
  const profit = roundUsdt(proceeds - stake);
  const sellOdds = Number(out.bookOdds) || 0;
  const createAt = Date.now();
  const buyLabels = resolvePfOrderLabels({
    marketId,
    tokenId,
    match: buy.match ?? buy.Match,
    bet: buy.bet ?? buy.Bet,
    item: buy.item ?? buy.Item,
  });
  const sellItem = pfSellItemLabel(buyLabels.item);
  const changmenCodeFeePatch = changmenCodeFeeSavePatch({
    rateBps: changmenCodeFeeRateBps > 0 ? changmenCodeFeeRateBps : undefined,
    usdt: changmenCodeFeeUsdt,
  });

  const closedSaved = await upsertPfServerOrder(playerId, [
    {
      orderId: rdsOrderKey(buy),
      provider: "PredictFun",
      match: buyLabels.match,
      bet: buyLabels.bet,
      item: buyLabels.item,
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
      pfSharesWei: buy.pfSharesWei ? String(buy.pfSharesWei) : undefined,
      pfShares: Number(buy.pfShares) > 0 ? Number(buy.pfShares) : undefined,
      pfHoldShares: holdShares,
      pfBookPrice: buy.pfBookPrice,
      pfSide: "buy",
      pfSellState: "closed",
      pfSellOrderId: sellOrderId,
      pfSellProceeds: proceeds,
      pfAmountFilled: fill.amountFilledRaw,
      pfFeeRateBps: buy.pfFeeRateBps,
      ...changmenCodeFeeSavePatch({
        rateBps: buy.pfChangmenCodeFeeRateBps,
        shares: buy.pfChangmenCodeFeeShares,
      }),
      pfLedgerState: proceeds > 0 ? "pending_credit" : "credited",
      pfPendingCreditUsdt: proceeds > 0 ? proceeds : 0,
      // Phase 1：仓位事件审计镜像（与独立卖单行双写）
      positionEvents: {
        sells: [{
          id: sellOrderId,
          at: createAt,
          shares: weiToDecimal18(filledSharesWei),
          price: Number(out.bookPrice) > 0 ? Number(out.bookPrice) : undefined,
          proceeds,
          pnl: profit,
          origin: "changmen",
          status: "closed",
        }],
      },
    },
    {
      orderId: sellOrderId,
      provider: "PredictFun",
      match: buyLabels.match,
      bet: buyLabels.bet,
      item: sellItem,
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
      pfFeeRateBps: Number(market?.feeRateBps ?? buy.pfFeeRateBps) >= 0
        ? Number(market?.feeRateBps ?? buy.pfFeeRateBps)
        : undefined,
      pfSide: "sell",
      pfBuyOrderId: rdsOrderKey(buy),
      pfSellState: "closed",
      pfOfficialStatus: official?.status,
      pfAmountFilled: fill.amountFilledRaw,
      ...sellFeePatch,
      ...changmenCodeFeePatch,
    },
  ], userId);
  if (!closedSaved)
    throw new Error("卖出落库失败");

  const owned = await assertPlayerOwnedByUser(playerId, userId);
  if (!owned.ok)
    throw new Error(owned.msg || "账号校验失败");

  let balanceOut;
  let totalProfitOut;
  if (proceeds > 0) {
    const creditResult = await applyPendingPfLedgerCredit(playerId, userId, {
      ...buy,
      orderId: rdsOrderKey(buy),
      match: buyLabels.match,
      bet: buyLabels.bet,
      item: buyLabels.item,
      odds: Number(buy.Odds ?? buy.odds) || 0,
      betMoney: stake,
      money: profit,
      status: "none",
      createAt: Number(buy.CreateAt ?? buy.createAt) || createAt,
      link: buy.Link ?? buy.link,
      pfSide: "buy",
      pfSellState: "closed",
      pfSellOrderId: sellOrderId,
      pfSellProceeds: proceeds,
      pfHoldShares: holdShares,
      pfMarketId: marketId,
      pfTokenId: tokenId,
      pfLedgerState: "pending_credit",
      pfPendingCreditUsdt: proceeds,
    });
    if (!creditResult.ok)
      throw new Error("回款入账失败，请稍后重试卖出以补齐入账");
    balanceOut = creditResult.balance;
  }
  else {
    const published = await publishPfBalanceKnown(
      playerId,
      userId,
      await resolvePfBalance(owned.player, userId, playerId),
    );
    balanceOut = published.ok ? published.info.balance : undefined;
    totalProfitOut = published.ok ? published.info.totalProfit : undefined;
  }

  return {
    buyOrderId: rdsOrderKey(buy),
    sellOrderId,
    shares: weiToDecimal18(filledSharesWei),
    proceedsUsdt: proceeds,
    profit,
    bookPrice: out.bookPrice,
    bookOdds: sellOdds,
    balance: balanceOut,
    totalProfit: totalProfitOut,
  };
}
