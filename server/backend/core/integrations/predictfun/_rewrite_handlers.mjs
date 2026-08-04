import fs from "fs";

let src = fs.readFileSync("pf_client_handlers.js", "utf8").replace(/\r\n/g, "\n");

function must(i, label) {
  if (i < 0) {
    console.error("missing", label);
    process.exit(1);
  }
  return i;
}

// 1) Drop syncAccountRowInKv
{
  const a = must(src.indexOf("/** 避免与 account_service 循环依赖"), "syncAccount");
  const b = must(src.indexOf("function requirePlayerId"), "requirePlayerId");
  src = src.slice(0, a) + src.slice(b);
}

// 2) Drop helpers after assertPfPlayer until RefreshBalance
{
  const needle = "return { ok: true, playerId: pid.playerId, player: owned.player };";
  const a = must(src.indexOf(needle), "assert return");
  let after = a + needle.length;
  // skip trailing newline and closing brace of assertPfPlayer
  const brace = src.indexOf("}", after);
  after = brace + 1;
  const b = must(src.indexOf("/** Pf_RefreshBalance", after), "RefreshBalance");
  src = src.slice(0, after) + "\n\n" + src.slice(b);
}

// 3) Drop rds* + syncOfficial + lookupOfficial
{
  const a = must(src.indexOf("\nfunction rdsOrderKey"), "rdsOrderKey");
  const b = must(src.indexOf("export async function settleResolvedPfOrdersForPlayer"), "settle");
  src = src.slice(0, a + 1) + src.slice(b);
}

const newImports = `import * as accountStore from "../../account/account_store.js";
import * as orderStore from "../../account/order_store.js";
import { assertPlayerOwnedByUser, isPredictFunPlayerRow } from "../../account/player_ownership.js";
import {
  changmenCodeFeeSavePatch,
  readChangmenCodeFeeRateBps,
  readChangmenCodeFeeShares,
  readChangmenCodeFeeUsdt,
} from "./pf_changmen_code_fee.js";
import { isPredictFunHouseConfigured, resolvePfHouseMaxStakeUsdt, resolvePfChangmenBuyFeeRateBps, resolvePfChangmenSellFeeRateBps } from "./house_credentials.js";
import {
  assertPfAvailableBalance,
  roundUsdt,
} from "./pf_ledger.js";
import {
  createAndSubmitHouseMarketBuy,
  createAndSubmitHouseMarketSell,
  decimal18ToWei,
  estimateHouseMarketBuyMakerUsdt,
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
import {
  evaluatePfBuyForSell,
  isPfSellBlockedForSettle,
  readPfLedgerState,
  readPfPendingCreditUsdt,
} from "./pf_lifecycle.js";
import {
  applyPendingPfLedgerCredit,
  loadPfOrders,
  publishPfBalanceKnown,
  resolvePfBalance,
  retryPendingPfLedgerCredits,
} from "./pf_player_account.js";
import {
  findPfOrderInList,
  rdsBetMoney,
  rdsOrderKey,
  rdsOrderStatus,
  rdsPfApiOrderId,
  rdsPfHash,
  rdsToMapInput,
} from "./pf_order_row.js";
import { syncOfficialOrderToRds, lookupOfficialOrder } from "./pf_sync_official.js";
import { extractBuyNotionalUsdt, extractSellFill } from "./pf_fill.js";
import {
  netSellProceedsAfterChangmenFee,
  netSellProceedsAfterCollateralFee,
  resolvePfFeeSavePatch,
} from "./pf_fee.js";
import { assertPredictMarketTradable } from "./pf_market_guard.js";
import { tryRedeemHouseMarketAfterSettle, redeemHouseResolvedPositions } from "./pf_house_redeem.js";
import {
  mapPredictOrderToVenueOrder,
  settlementFromPredictOfficialStatus,
  waitForHouseOrderTerminal,
  awaitHouseOrderFee,
} from "./pf_orders.js";
import { pfSellItemLabel, resolvePfOrderLabels } from "./pf_order_labels.js";
import {
  toUserPfGetOrderInfo,
  toUserPfSubmitOrderInfo,
  toUserPfSubmitSellInfo,
  toUserPfVenueOrders,
} from "./pf_user_dto.js";
`;

{
  const a = must(src.indexOf("import * as accountStore"), "imports start");
  const b = must(src.indexOf("function requirePlayerId"), "imports end");
  src = src.slice(0, a) + newImports + "\n" + src.slice(b);
}

// 4) Sell gate → evaluatePfBuyForSell
const oldSellGate = `      const list = await loadPfOrders(gate.playerId, userId);
      const buy = list.find((row) => {
        const id = rdsOrderKey(row);
        const hash = rdsPfHash(row);
        return id === buyOrderId || hash === buyOrderId;
      });
      if (!buy)
        throw new Error("找不到对应买单");
      if (String(buy.pfSide ?? "").toLowerCase() === "sell")
        throw new Error("不能对卖单再卖");
      const buySellState = String(buy.pfSellState ?? "").toLowerCase();
      if (buySellState === "closed") {
        if (readPfLedgerState(buy) === "pending_credit") {
          const creditResult = await applyPendingPfLedgerCredit(gate.playerId, userId, buy);
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
        throw new Error("该买单已卖出");
      }
      if (buySellState === "settled")
        throw new Error("该买单已结算");
      const resumeClosing = isPfSellClosing(buy);
      const resumeSellHash = String(buy.pfSellOrderId ?? "").trim();
      if (resumeClosing && !resumeSellHash)
        throw new Error("卖出确认中（缺 sell hash），请联系客服");
      const st = String(rdsOrderStatus(buy)).toLowerCase();
      if (st === "reject" || st === "return" || st === "pending")
        throw new Error("买单尚未确认成交或已拒单，不能卖出");
      if (st === "win" || st === "lose")
        throw new Error("买单已到期结算，不能卖出");

      const marketId = String(buy.pfMarketId ?? buy.Match ?? buy.match ?? "").trim();
      const tokenId = String(buy.pfTokenId ?? buy.Item ?? buy.item ?? "").trim();
      if (!marketId || !tokenId)
        throw new Error("买单缺少 marketId/tokenId");

      // 可卖份额只认 RDS pfHoldShares（已含官网 SHARES + Changmencodefee）；禁止回退毛仓/名义估份额
      const holdShares = Number(buy.pfHoldShares);
      if (!(Number.isFinite(holdShares) && holdShares > 0))
        throw new Error("持仓未就绪，请稍后重试 GetOrder 后再卖");`;

const newSellGate = `      const list = await loadPfOrders(gate.playerId, userId);
      const buy = findPfOrderInList(list, buyOrderId);
      const gateSell = evaluatePfBuyForSell(buy);
      if (!gateSell.ok)
        throw new Error(gateSell.msg);
      if (gateSell.action === "resume_credit") {
        const creditResult = await applyPendingPfLedgerCredit(gate.playerId, userId, buy);
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
        throw new Error("买单缺少 marketId/tokenId");`;

if (!src.includes(oldSellGate)) {
  console.error("sell gate block not found exactly — skip sell rewrite");
}
else {
  src = src.replace(oldSellGate, newSellGate);
  console.log("sell gate rewritten");
}

// GetOrder find → findPfOrderInList
src = src.replace(
  `    const list = await loadPfOrders(gate.playerId, userId);
    const rdsRow = list.find(row => {
      const id = rdsOrderKey(row);
      const hash = rdsPfHash(row);
      const apiId = rdsPfApiOrderId(row);
      return id === orderId || hash === orderId || (apiId && apiId === orderId);
    }) ?? null;`,
  `    const list = await loadPfOrders(gate.playerId, userId);
    const rdsRow = findPfOrderInList(list, orderId);`,
);

fs.writeFileSync("pf_client_handlers.js", src);
console.log("done lines", src.split("\n").length);
