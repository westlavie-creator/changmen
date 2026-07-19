/**
 * [changmen 扩展] 订单栏手动卖出（单买单）。
 *
 * 契约：只执行「卖当前这张买单的剩余份额」并返回结果。
 * - 先买后卖；每个卖出按钮只绑定当前买单
 * - 不撤挂单、不碰其它买单/卖单、不回挂止盈
 */
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { VenueOrder } from "../contract";
import { PLATFORMS } from "../shared/platforms";
import { POLYMARKET_CLOB_API } from "./api";
import { resolvePolymarketBuilderCode } from "./builder";
import {
  parseTokenConfig,
  resolveApiCreds,
  resolveFunder,
  resolvePrivateKey,
  type PolymarketTokenConfig,
} from "./l2Auth";
import { pmGetBook, pmSubmitOrder } from "./pmClientApi";
import { markPolymarketChangmenOrder } from "./pmOrigin";
import {
  hasOpenPolymarketPosition,
  resolveBuyStakeUsdc,
  resolvePmFillShares,
  resolvePmRemainingShares,
  venueOrderFromOrderRow,
  type OrderRowLike,
} from "./pmLogicalPosition";
import { estimatePolymarketSellProceedsUsdc, type PolymarketBidLevel } from "./parse";
import {
  buildPolymarketDelayedPollOpts,
  buildPolymarketWatchTimeoutMs,
  fetchPolymarketMarketSecondsDelay,
} from "./marketDelay";
import { settlePolymarketDelayedOrder } from "./orderSettlement";
import {
  parsePolymarketSellOrderFill,
  POLYMARKET_SELL_FILL_RETRY_OPTS,
  resolvePolymarketSellFill,
  resolvePolymarketSellFillWithRetry,
} from "./orders";
import { POLYMARKET_DELAYED_TRADE_CONFIRM_OPTS } from "./orderStatus";
import {
  normalizePolymarketTickSize,
  type PolymarketTickSize,
} from "./pmTickPrice";
import { polymarketCnyFromUsdt } from "./pmStake";
import {
  awaitPolymarketSettlementJob,
  startPolymarketSettlementJob,
} from "./settlementJob";
import { registerPolymarketOrderWatch } from "./userWs";

type Hex = `0x${string}`;

interface PolymarketOrderBookResponse {
  tick_size?: string | number;
  minimum_tick_size?: string | number;
  min_order_size?: string | number;
  neg_risk?: boolean;
  bids?: Array<{ price?: string | number; size?: string | number }>;
}

interface PolymarketOrderResponse {
  success?: boolean;
  errorMsg?: string;
  orderID?: string;
  status?: string;
  makingAmount?: string;
  takingAmount?: string;
}

export interface PolymarketManualSellResult {
  ok: boolean;
  error?: string;
  sellOrderId?: string;
  sharesSold?: number;
  fillPrice?: number;
  proceedsUsdc?: number;
  pending?: boolean;
  /** 待 saveOrders：买单 patch + 卖单（先买后卖，便于同批跟 Link） */
  ordersToSave?: VenueOrder[];
  /** 已确认成交但份数少于请求（仍应落库） */
  partialFill?: boolean;
  /** 链上已拿到 sell orderId，但成交确认/落库未完成 */
  chainSubmitted?: boolean;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function resolveSdkSignatureType(value: string | number | undefined): number {
  const numeric = Number(value ?? 0);
  return [1, 2, 3].includes(numeric) ? numeric : 0;
}

function parseBidsFromBook(book: PolymarketOrderBookResponse | null | undefined): PolymarketBidLevel[] {
  return (book?.bids ?? [])
    .map(level => ({
      price: Number(level.price),
      size: Number(level.size),
    }))
    .filter(level =>
      Number.isFinite(level.price)
      && Number.isFinite(level.size)
      && level.price > 0
      && level.price < 1
      && level.size > 0,
    )
    .sort((a, b) => b.price - a.price);
}

/** FOK 卖：worst-price = 吃满份额所需最低 bid 档 */
export function calculateSellMarketLimitPrice(
  bids: PolymarketBidLevel[],
  shares: number,
  minOrderSize: number,
): number {
  if (!Number.isFinite(shares) || shares <= 0)
    throw new Error(`无效卖出份数 ${shares}`);
  if (minOrderSize > 0 && shares + 1e-12 < minOrderSize)
    throw new Error(`卖出份数 ${shares} 低于 min_order_size ${minOrderSize}`);
  if (!bids.length)
    throw new Error("Polymarket 盘口无 bids，无法市价卖出");

  let remaining = shares;
  let worst = 0;
  for (const level of bids) {
    if (remaining <= 0)
      break;
    const fill = Math.min(remaining, level.size);
    worst = level.price;
    remaining -= fill;
  }
  if (remaining > 1e-6)
    throw new Error("Polymarket FOK 卖出深度不足（bids 不够吃满该买单份额）");
  if (!(worst > 0 && worst < 1))
    throw new Error(`无效卖出限价 ${worst}`);
  return worst;
}

async function createPolymarketFokSellOrderBody(
  gateway: string,
  privateKey: Hex,
  creds: ReturnType<typeof resolveApiCreds>,
  config: PolymarketTokenConfig,
  tokenId: string,
  price: number,
  shares: number,
  orderOptions: { tickSize: PolymarketTickSize; negRisk: boolean },
) {
  const [
    clob,
    viem,
    accounts,
    chains,
  ] = await Promise.all([
    import("@polymarket/clob-client-v2"),
    import("viem"),
    import("viem/accounts"),
    import("viem/chains"),
  ]);
  const account = accounts.privateKeyToAccount(privateKey);
  const signer = viem.createWalletClient({
    account,
    chain: chains.polygon,
    transport: viem.http(),
  });
  const builderCode = resolvePolymarketBuilderCode();
  const client = new clob.ClobClient({
    host: gateway,
    chain: clob.Chain.POLYGON,
    signer,
    creds: {
      key: creds.apiKey!,
      secret: creds.secret!,
      passphrase: creds.passphrase!,
    },
    signatureType: resolveSdkSignatureType(creds.signatureType) as any,
    funderAddress: resolveFunder(config) || undefined,
    builderConfig: { builderCode },
  });
  Reflect.set(client, "cachedVersion", 2);
  client.tickSizes[tokenId] = orderOptions.tickSize as any;
  client.negRisk[tokenId] = orderOptions.negRisk;
  client.feeInfos[tokenId] = { rate: 0, exponent: 0 };
  client.builderFeeRates[builderCode] = { maker: 0, taker: 0 };

  const signedOrder = await client.createMarketOrder({
    tokenID: tokenId,
    price,
    amount: shares,
    side: clob.Side.SELL,
  }, {
    tickSize: orderOptions.tickSize as any,
    negRisk: orderOptions.negRisk,
  });
  if (!clob.isV2Order(signedOrder))
    throw new Error("Polymarket SDK 未生成 CLOB v2 卖单");
  return clob.orderToJsonV2(signedOrder, creds.apiKey!, clob.OrderType.FOK, false, false);
}

function buildSellAndBuyPatchOrders(params: {
  buy: VenueOrder;
  sellOrderId: string;
  sharesSold: number;
  proceedsUsdc: number;
  fillPrice: number;
  createAt: number;
}): VenueOrder[] {
  const { buy, sellOrderId, sharesSold, proceedsUsdc, fillPrice, createAt } = params;
  const fillShares = resolvePmFillShares(buy);
  const remainingBefore = resolvePmRemainingShares(buy);
  const deduct = Math.min(sharesSold, remainingBefore > 0 ? remainingBefore : fillShares);
  const costUsdc = resolveBuyStakeUsdc(buy);
  const costPortion = remainingBefore > 0.0001
    ? round4(costUsdc * (deduct / remainingBefore))
    : round4(costUsdc);
  const profitUsdc = round4(proceedsUsdc - costPortion);
  const proceedsCny = polymarketCnyFromUsdt(proceedsUsdc);
  const profitCny = Math.round(polymarketCnyFromUsdt(profitUsdc));
  const prevBuyMoney = Number(buy.money) || 0;
  const originalBetMoney = Number(buy.betMoney) > 0
    ? Number(buy.betMoney)
    : Math.round(polymarketCnyFromUsdt(costUsdc) * 100) / 100;

  const sell: VenueOrder = {
    provider: PLATFORMS.Polymarket,
    orderId: sellOrderId,
    odds: fillPrice > 0 ? round4(1 / fillPrice) : 0,
    createAt,
    betMoney: proceedsCny,
    reward: 0,
    // [changmen] 已实现盈亏统一记买单；卖单只保留回款流水
    money: 0,
    status: "none",
    game: buy.game,
    match: buy.match,
    bet: buy.bet,
    item: buy.item ? `平仓 ${buy.item}` : "平仓",
    link: Number(buy.link) || undefined,
    pmTokenId: buy.pmTokenId,
    pmShares: sharesSold,
    pmFillPrice: fillPrice,
    pmStakeUsdc: costPortion,
    pmConditionId: buy.pmConditionId,
    pmOrigin: "changmen",
    pmSide: "sell",
    pmBuyOrderId: buy.orderId,
    pmRealizedPnlUsdc: profitUsdc,
  };

  const attributedRaw = round4((buy.pmAttributedSellShares ?? 0) + deduct);
  // FOK 卖出份数常四舍五入短一截（如 48.23 vs 48.2353），剩余尘量视为已卖光
  const remainingAfter = resolvePmRemainingShares({
    ...buy,
    pmAttributedSellShares: attributedRaw,
    pmShares: fillShares,
  });
  const closed = remainingAfter <= 0;
  const attributed = closed && fillShares > 0 ? round4(fillShares) : attributedRaw;
  const stakeLeftUsdc = closed ? 0 : round4(Math.max(0, costUsdc - costPortion));
  const buyPatch: VenueOrder = {
    ...buy,
    pmOrigin: "changmen",
    pmSide: "buy",
    pmAttributedSellShares: attributed,
    pmSellState: closed ? "closed" : "partial",
    pmStakeUsdc: stakeLeftUsdc,
    // 原始投注本金不改；剩余敞口只看 pmStakeUsdc / 剩余份额
    betMoney: originalBetMoney,
    money: prevBuyMoney + profitCny,
    pmRealizedPnlUsdc: round4((Number(buy.pmRealizedPnlUsdc) || 0) + profitUsdc),
    status: "none",
  };

  return [buyPatch, sell];
}

/** 单测 / 调试：手动卖出后的买卖补丁 */
export { buildSellAndBuyPatchOrders };

/**
 * [changmen 扩展] 手动卖 delayed：与买单对齐——按 conditionId 拉 `sd`、
 * User WS watch + settlement job（SELL），再补齐 shares/USDC。
 */
export async function confirmPolymarketManualSellDelayedFill(params: {
  account: PlatformAccount;
  sellOrderId: string;
  conditionId: string;
  postResponse: {
    makingAmount?: string | number;
    takingAmount?: string | number;
  } | null | undefined;
}): Promise<{ sharesSold: number; proceedsUsdc: number }> {
  const conditionId = String(params.conditionId ?? "").trim();
  const delayInfo = conditionId
    ? await fetchPolymarketMarketSecondsDelay(conditionId)
    : { secondsDelay: 1, takerOrderDelayEnabled: false };
  const poll = buildPolymarketDelayedPollOpts(delayInfo.secondsDelay);
  const watchTimeoutMs = buildPolymarketWatchTimeoutMs(delayInfo.secondsDelay);
  if (conditionId) {
    registerPolymarketOrderWatch(params.account, params.sellOrderId, {
      conditionId,
      timeoutMs: watchTimeoutMs,
    });
  }
  else {
    console.warn(
      "[Polymarket] 手动卖 delayed 缺 pmConditionId，User WS 未订阅；仅 REST 确认",
    );
  }

  const tradeConfirm = {
    ...POLYMARKET_DELAYED_TRADE_CONFIRM_OPTS,
    maxRetries: Math.max(
      POLYMARKET_DELAYED_TRADE_CONFIRM_OPTS.maxRetries,
      poll.maxAttempts,
    ),
  };
  startPolymarketSettlementJob(params.account, params.sellOrderId, {
    side: "SELL",
    poll,
    tradeConfirm,
  });

  const settled = await awaitPolymarketSettlementJob(params.account, params.sellOrderId)
    ?? await settlePolymarketDelayedOrder(params.account, params.sellOrderId, {
      side: "SELL",
      poll,
      tradeConfirm,
    });

  if (settled.outcome === "unfilled")
    throw new Error("卖单延迟窗结束后未成交，未写入平仓");
  if (settled.outcome !== "matched")
    throw new Error("卖单延迟撮合未确认成交，未写入平仓");

  const resolved = await resolvePolymarketSellFillWithRetry(
    params.account,
    params.sellOrderId,
    params.postResponse,
    {
      lookbackMs: POLYMARKET_SELL_FILL_RETRY_OPTS.lookbackMs,
      retryMs: POLYMARKET_SELL_FILL_RETRY_OPTS.retryMs,
      maxRetries: Math.max(6, Math.ceil(poll.maxAttempts / 2)),
      orderRow: settled.row,
    },
  );
  if (!(resolved.sharesSold > 0) || !(resolved.proceedsUsdc > 0))
    throw new Error("卖单延迟撮合未确认成交份数/回款，未写入平仓");
  return resolved;
}

/**
 * 按指令卖出当前买单剩余份额（FOK），并返回成交结果（含仅本买单的落库 patch）。
 */
export async function sellPolymarketBuyPosition(params: {
  account: PlatformAccount;
  buyRow: OrderRowLike | VenueOrder;
}): Promise<PolymarketManualSellResult> {
  const buy = "provider" in params.buyRow && "orderId" in params.buyRow
    ? params.buyRow as VenueOrder
    : venueOrderFromOrderRow(params.buyRow);

  if (String(buy.provider) !== "Polymarket" && String((params.buyRow as OrderRowLike).Type ?? "") !== "Polymarket")
    return { ok: false, error: "非 Polymarket 订单" };
  if (buy.pmSide === "sell")
    return { ok: false, error: "卖单不可再卖" };
  if (!hasOpenPolymarketPosition(buy) && resolvePmRemainingShares(buy) <= 0.0001)
    return { ok: false, error: "该买单已无剩余份额" };

  const tokenId = String(buy.pmTokenId ?? "").trim();
  if (!tokenId)
    return { ok: false, error: "缺少 pmTokenId" };

  const sharesWanted = resolvePmRemainingShares(buy) > 0.0001
    ? resolvePmRemainingShares(buy)
    : resolvePmFillShares(buy);
  if (!(sharesWanted > 0))
    return { ok: false, error: "该买单份额无效" };

  const config = parseTokenConfig(params.account.token);
  const creds = resolveApiCreds(config);
  const privateKey = resolvePrivateKey(config);
  if (!creds.address)
    return { ok: false, error: "凭证缺少 walletAddress" };
  if (!privateKey)
    return { ok: false, error: "缺少有效私钥" };
  if (!creds.apiKey || !creds.secret || !creds.passphrase)
    return { ok: false, error: "凭证缺少用户 API Key" };

  const gateway = params.account.gateway || POLYMARKET_CLOB_API;

  let submittedSellOrderId = "";
  try {
    const book = await pmGetBook<PolymarketOrderBookResponse>(tokenId, gateway);
    const bids = parseBidsFromBook(book);
    const tickSize = normalizePolymarketTickSize(book?.tick_size ?? book?.minimum_tick_size);
    const minOrderSize = Number(book?.min_order_size) || 0;
    const negRisk = Boolean(book?.neg_risk);

    const estimated = estimatePolymarketSellProceedsUsdc(bids, sharesWanted);
    if (!(estimated > 0))
      throw new Error("bids 深度不足以全卖该买单份额");

    const price = calculateSellMarketLimitPrice(bids, sharesWanted, minOrderSize);
    const orderBody = await createPolymarketFokSellOrderBody(
      gateway,
      privateKey,
      creds,
      config,
      tokenId,
      price,
      sharesWanted,
      { tickSize, negRisk },
    );
    const result = await pmSubmitOrder<PolymarketOrderResponse>(params.account, orderBody);
    const sellOrderId = String(result?.orderID ?? "").trim();
    submittedSellOrderId = sellOrderId;
    if (!result?.success || !sellOrderId) {
      throw new Error(String(result?.errorMsg ?? "FOK 卖单未受理").trim() || "FOK 卖单未受理");
    }

    const filled = parsePolymarketSellOrderFill(result);
    let sharesSold = filled.sharesSold;
    let proceedsUsdc = filled.proceedsUsdc;
    // 卖单：making=shares、taking=USDC；勿复用买单的 isPolymarketDelayedPending(只看 taking)
    const statusLc = String(result?.status ?? "").trim().toLowerCase();
    const sellFillComplete = sharesSold > 0 && proceedsUsdc > 0;
    const pending = Boolean(result?.success)
      && statusLc === "delayed"
      && !sellFillComplete;

    if (!sellFillComplete && !pending) {
      const resolved = await resolvePolymarketSellFill(params.account, sellOrderId, result);
      sharesSold = resolved.sharesSold;
      proceedsUsdc = resolved.proceedsUsdc;
    }

    if (pending && !(sharesSold > 0 && proceedsUsdc > 0)) {
      const resolved = await confirmPolymarketManualSellDelayedFill({
        account: params.account,
        sellOrderId,
        conditionId: String(buy.pmConditionId ?? "").trim(),
        postResponse: result,
      });
      sharesSold = resolved.sharesSold;
      proceedsUsdc = resolved.proceedsUsdc;
    }

    if (!(sharesSold > 0) || !(proceedsUsdc > 0)) {
      throw new Error("FOK 卖出未确认成交份数/回款");
    }

    // 已确认成交必须落库；部分成交也按实成交归因（勿 throw，否则本地仍可再卖）
    const fillPrice = round4(proceedsUsdc / sharesSold);
    markPolymarketChangmenOrder(params.account.accountId, sellOrderId);

    const ordersToSave = buildSellAndBuyPatchOrders({
      buy: { ...buy, provider: PLATFORMS.Polymarket },
      sellOrderId,
      sharesSold,
      proceedsUsdc,
      fillPrice: fillPrice > 0 && fillPrice < 1 ? fillPrice : price,
      createAt: Date.now(),
    });
    const sellRow = ordersToSave.find(o => o.pmSide === "sell");

    return {
      ok: true,
      sellOrderId,
      sharesSold,
      fillPrice: sellRow?.pmFillPrice,
      proceedsUsdc,
      pending: false,
      ordersToSave,
      partialFill: sharesSold + 0.05 < sharesWanted,
    };
  }
  catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      sellOrderId: submittedSellOrderId || undefined,
      /** 链上已受理但成交未确认：上层应禁止再点卖出 */
      chainSubmitted: Boolean(submittedSellOrderId),
    };
  }
}

