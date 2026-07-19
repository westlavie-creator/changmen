/**
 * Predict.fun house MARKET FOK 下单（VPS 持钥签名）
 * BUY / SELL 均走运营主号；changmen 用户账号仅归属。
 * @see https://dev.predict.fun/how-to-create-or-cancel-orders-679306m0
 */

import { truncateOddsTo3 } from "@changmen/shared/odds_format";

import { fetchPredictFunHouseJwt } from "./pf_auth.js";
import { fetchPredictMarket, fetchPredictOrderbook, predictFunPost } from "./pf_api.js";
import { ensureHouseApprovals } from "./pf_house_approvals.js";
import { ensureHouseWalletEventsStarted } from "./pf_wallet_events.js";
import {
  bestAskFromPredictBook,
  bestBidFromPredictBook,
  executableBuyBook,
  executableSellBook,
  filterAsksByMaxPrice,
  filterBidsByMinPrice,
} from "./pf_orderbook.js";
import { assertPredictMarketTradable } from "./pf_market_guard.js";
import {
  resolvePredictFunApiBase,
  resolvePredictFunHouseCredentials,
  resolvePfHouseMaxStakeUsdt,
} from "./house_credentials.js";

const DEFAULT_SLIPPAGE_BPS = 100n;

/** house 签单串行，避免并发 nonce/余额竞态 */
let houseOrderChain = Promise.resolve();

export function withHouseOrderLock(fn) {
  const run = houseOrderChain.then(() => fn(), () => fn());
  houseOrderChain = run.then(() => undefined, () => undefined);
  return run;
}

export function isValidPredictClobPrice(value) {
  return Number.isFinite(value) && value > 0 && value < 1;
}

function parseUsdtToWei(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`无效投注金额 ${amount}`);
  return BigInt(Math.round(value * 1e6)) * 1_000_000_000_000n;
}

/** 协议金额 wei(1e18) → 小数 */
export function weiToDecimal18(wei) {
  try {
    return Number(BigInt(String(wei ?? "0"))) / 1e18;
  }
  catch {
    return 0;
  }
}

export function decimal18ToWei(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`无效份额 ${amount}`);
  return BigInt(Math.round(value * 1e18));
}

function resolvePredictChainId(apiBase) {
  return String(apiBase).includes("testnet") ? 97 : 56;
}

async function loadPredictSdk() {
  const [sdk, ethers] = await Promise.all([
    import("@predictdotfun/sdk"),
    import("ethers"),
  ]);
  return { sdk, ethers };
}

async function prepareHouseSigner() {
  const credentials = resolvePredictFunHouseCredentials();
  if (!credentials?.privateKey)
    throw new Error("未配置 Predict.fun 运营主号（PREDICT_FUN_PRIVY_PRIVATE_KEY）");

  const { sdk, ethers } = await loadPredictSdk();
  const { Wallet } = ethers;
  const { OrderBuilder, ChainId, Side } = sdk;

  const apiBase = resolvePredictFunApiBase();
  const signer = new Wallet(credentials.privateKey);
  const predictAccount = String(credentials.predictAccount ?? "").trim();
  const chainId = resolvePredictChainId(apiBase) === 97
    ? ChainId.BnbTestnet
    : ChainId.BnbMainnet;
  const orderBuilder = predictAccount
    ? await OrderBuilder.make(chainId, signer, { predictAccount })
    : await OrderBuilder.make(chainId, signer);

  await ensureHouseApprovals(orderBuilder);
  ensureHouseWalletEventsStarted();

  const maker = predictAccount || await signer.getAddress();
  const jwt = await fetchPredictFunHouseJwt({
    apiBase,
    signer: maker,
    signMessage: async (message) => {
      if (predictAccount && typeof orderBuilder.signPredictAccountMessage === "function")
        return orderBuilder.signPredictAccountMessage(message);
      return signer.signMessage(message);
    },
  });

  return { Side, orderBuilder, maker, jwt };
}

export async function resolveExecutableBuy({
  tokenId,
  marketId,
  detectionOdds,
  maxPrice,
}) {
  if (!isValidPredictClobPrice(maxPrice))
    throw new Error(`无效检测价 ${maxPrice}（赔率 ${detectionOdds}）`);
  if (!marketId)
    throw new Error("缺少 Predict.fun marketId");

  const [yesBook, market] = await Promise.all([
    fetchPredictOrderbook(marketId),
    fetchPredictMarket(marketId),
  ]);
  if (!yesBook)
    throw new Error(`Predict.fun orderbook 为空（market ${marketId}）`);

  const book = executableBuyBook(yesBook, market, tokenId);
  const tradable = assertPredictMarketTradable(market);
  if (!tradable.ok)
    throw new Error(tradable.msg);
  const asks = filterAsksByMaxPrice(book.asks ?? [], maxPrice);
  if (!asks.length) {
    const best = bestAskFromPredictBook(book);
    throw new Error([
      "Predict.fun 盘口价高于检测价，整单取消",
      best > 0
        ? `- 最佳卖价 ${best}（赔率 ${truncateOddsTo3(1 / best)}）高于检测上限 ${maxPrice}`
        : "- 盘口无卖单",
    ].join("\n"));
  }

  const bookPrice = bestAskFromPredictBook({ asks });
  if (!isValidPredictClobPrice(bookPrice))
    throw new Error("Predict.fun 盘口无有效 best ask");

  return {
    bookPrice,
    bookOdds: truncateOddsTo3(1 / bookPrice),
    bookFetchedAt: Date.now(),
    feeRateBps: Number(market?.feeRateBps ?? 0) || 0,
    isNegRisk: Boolean(market?.isNegRisk),
    isYieldBearing: Boolean(market?.isYieldBearing),
    market,
    sideBook: book,
    yesBook,
  };
}

export async function createAndSubmitHouseMarketBuy(params) {
  const maxStake = resolvePfHouseMaxStakeUsdt();
  if (Number(params.apiBetMoney) > maxStake + 1e-9)
    throw new Error(`单笔超过上限 ${maxStake} USDT`);

  const t0 = Date.now();
  const logStep = (step) => {
    console.info(`[Pf_SubmitBuy] ${step} market=${params.marketId} +${Date.now() - t0}ms`);
  };
  logStep("start");

  const { Side, orderBuilder, maker, jwt } = await prepareHouseSigner();
  logStep("signer_ready");

  const [bookRaw, market] = await Promise.all([
    fetchPredictOrderbook(params.marketId),
    fetchPredictMarket(params.marketId),
  ]);
  logStep("book_ready");
  if (!bookRaw)
    throw new Error("下单前 orderbook 为空");

  const tradableBuy = assertPredictMarketTradable(market);
  if (!tradableBuy.ok)
    throw new Error(tradableBuy.msg);

  const sideBook = executableBuyBook(bookRaw, market, params.tokenId);
  const cappedAsks = filterAsksByMaxPrice(sideBook.asks ?? [], params.maxPrice);
  if (!cappedAsks.length)
    throw new Error("下单前盘口价高于检测价或无 asks");

  const book = {
    marketId: Number(params.marketId),
    updateTimestampMs: Number(sideBook.updateTimestampMs ?? bookRaw.updateTimestampMs ?? Date.now()),
    asks: cappedAsks,
    bids: sideBook.bids ?? [],
  };

  const slippageBps = params.maxSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const amounts = orderBuilder.getMarketOrderAmounts(
    {
      side: Side.BUY,
      valueWei: parseUsdtToWei(params.apiBetMoney),
      slippageBps,
      isMinAmountOut: true,
    },
    book,
  );

  const feeRateBps = Number(params.feeRateBps ?? market?.feeRateBps ?? 0) || 0;
  const order = orderBuilder.buildOrder("MARKET", {
    maker,
    signer: maker,
    side: Side.BUY,
    tokenId: params.tokenId,
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    nonce: 0n,
    feeRateBps,
  });

  const typedData = orderBuilder.buildTypedData(order, {
    isNegRisk: Boolean(params.isNegRisk ?? market?.isNegRisk),
    isYieldBearing: Boolean(params.isYieldBearing ?? market?.isYieldBearing),
  });
  const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
  const hash = orderBuilder.buildTypedDataHash(typedData);
  logStep("signed");

  const body = {
    data: {
      order: { ...signedOrder, hash },
      pricePerShare: amounts.pricePerShare.toString(),
      strategy: "MARKET",
      slippageBps: slippageBps.toString(),
      isFillOrKill: true,
      isMinAmountOut: amounts.isMinAmountOut,
    },
  };

  logStep("post_orders");
  const result = await predictFunPost("/v1/orders", body, jwt);
  logStep(`post_ok accepted=${Boolean(result?.data?.orderId || result?.success)}`);
  const bookPrice = bestAskFromPredictBook({ asks: cappedAsks });
  return {
    requestBody: body,
    result,
    bookPrice,
    bookOdds: truncateOddsTo3(1 / bookPrice),
    signerAddress: maker,
    /** BUY：taker=份额 wei */
    sharesWei: String(amounts.takerAmount),
    shares: weiToDecimal18(amounts.takerAmount),
  };
}

/**
 * MARKET FOK 卖出：quantityWei = 买单份额（1:1 全卖）
 * @param {{ tokenId: string, marketId: string, sharesWei: string|bigint, minPrice?: number, feeRateBps?: number, isNegRisk?: boolean, isYieldBearing?: boolean, maxSlippageBps?: bigint }} params
 */
export async function createAndSubmitHouseMarketSell(params) {
  const sharesWei = BigInt(String(params.sharesWei ?? "0"));
  if (sharesWei <= 0n)
    throw new Error("卖出份额无效");

  const { Side, orderBuilder, maker, jwt } = await prepareHouseSigner();

  const [bookRaw, market] = await Promise.all([
    fetchPredictOrderbook(params.marketId),
    fetchPredictMarket(params.marketId),
  ]);
  if (!bookRaw)
    throw new Error("卖出前 orderbook 为空");

  const tradableSell = assertPredictMarketTradable(market);
  if (!tradableSell.ok)
    throw new Error(tradableSell.msg);

  const sideBook = executableSellBook(bookRaw, market, params.tokenId);
  const minPrice = params.minPrice;
  const cappedBids = filterBidsByMinPrice(sideBook.bids ?? [], minPrice);
  if (!cappedBids.length) {
    const best = bestBidFromPredictBook(sideBook);
    throw new Error(
      best > 0
        ? `Predict.fun 买盘低于底价（best bid ${best}）`
        : "Predict.fun 盘口无 bids，无法市价卖出",
    );
  }

  const book = {
    marketId: Number(params.marketId),
    updateTimestampMs: Number(sideBook.updateTimestampMs ?? bookRaw.updateTimestampMs ?? Date.now()),
    asks: sideBook.asks ?? [],
    bids: cappedBids,
  };

  const slippageBps = params.maxSlippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const amounts = orderBuilder.getMarketOrderAmounts(
    {
      side: Side.SELL,
      quantityWei: sharesWei,
      slippageBps,
    },
    book,
  );

  const feeRateBps = Number(params.feeRateBps ?? market?.feeRateBps ?? 0) || 0;
  const order = orderBuilder.buildOrder("MARKET", {
    maker,
    signer: maker,
    side: Side.SELL,
    tokenId: params.tokenId,
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    nonce: 0n,
    feeRateBps,
  });

  const typedData = orderBuilder.buildTypedData(order, {
    isNegRisk: Boolean(params.isNegRisk ?? market?.isNegRisk),
    isYieldBearing: Boolean(params.isYieldBearing ?? market?.isYieldBearing),
  });
  const signedOrder = await orderBuilder.signTypedDataOrder(typedData);
  const hash = orderBuilder.buildTypedDataHash(typedData);

  const body = {
    data: {
      order: { ...signedOrder, hash },
      pricePerShare: amounts.pricePerShare.toString(),
      strategy: "MARKET",
      slippageBps: slippageBps.toString(),
      isFillOrKill: true,
      isMinAmountOut: amounts.isMinAmountOut,
    },
  };

  const result = await predictFunPost("/v1/orders", body, jwt);
  const bookPrice = bestBidFromPredictBook({ bids: cappedBids });
  /** SELL：taker≈USDT 回款 wei */
  const proceeds = weiToDecimal18(amounts.takerAmount);
  return {
    requestBody: body,
    result,
    bookPrice,
    bookOdds: bookPrice > 0 ? truncateOddsTo3(1 / bookPrice) : 0,
    signerAddress: maker,
    sharesWei: String(sharesWei),
    shares: weiToDecimal18(sharesWei),
    proceedsUsdt: proceeds,
    pricePerShare: weiToDecimal18(amounts.pricePerShare) || bookPrice,
  };
}

export function isPredictFunOrderAccepted(result) {
  if (!result?.success)
    return false;
  return String(result.data?.orderId ?? "").trim().length > 0;
}

/** 无 pfSharesWei 的旧买单：用本金/买入价估份额 */
export function estimatePfSharesWei(betMoney, bookPrice) {
  const stake = Number(betMoney);
  const price = Number(bookPrice);
  if (!(stake > 0) || !(price > 0 && price < 1))
    return 0n;
  return decimal18ToWei(stake / price);
}
