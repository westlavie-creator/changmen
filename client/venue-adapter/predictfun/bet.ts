import type { PlatformProvider } from "@venue/contract";
import type { BetOption } from "@changmen/client-core/models/betOption";
import { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { getVenueOddsEntry } from "@changmen/client-core/bridge/oddsAccess";
import { PLATFORMS } from "@venue/shared/platforms";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";

import { fetchPredictFunJwt, predictFunJwtHeaders } from "./auth";
import {
  fetchPredictMarket,
  fetchPredictOrderbook,
  PREDICT_FUN_API,
} from "./api";
import {
  resolvePredictFunMasterCredentials,
} from "./masterAccount";
import { bestAskFromPredictBook } from "./parse";
import {
  detectionMaxPriceFromOdds,
  isValidPredictClobPrice,
  resolvePredictFunDetectionMaxPrice,
} from "./pfDetection";
import { predictFunHttpPost } from "./transport";

const PLATFORM = PLATFORMS.PredictFun;
const DEFAULT_SLIPPAGE_BPS = 100n;
const PRECHECK_BOOK_REUSE_MS = 800;

export interface PredictFunBuyCheckData {
  tokenId: string;
  marketId: string;
  odds: number;
  detectionOdds: number;
  detectionMaxPrice: number;
  detectionClobPrice?: number;
  bookPrice: number;
  betMoney: number;
  apiBetMoney: number;
  side: "BUY";
  bookFetchedAt: number;
  feeRateBps: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
}

interface PredictCreateOrderResponse {
  success?: boolean;
  data?: {
    code?: string;
    orderId?: string;
    orderHash?: string;
  };
}

function resolvePredictChainId(apiBase: string): number {
  return apiBase.includes("testnet") ? 97 : 56;
}

function parseUsdtToWei(amount: number): bigint {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`无效投注金额 ${amount}`);
  return BigInt(Math.round(value * 1e6)) * 1_000_000_000_000n;
}

function resolveApiBetMoney(option: BetOption): number {
  const value = Number(option.betMoney);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`无效投注金额 ${option.betMoney}`);
  return Math.round(value * 100) / 100;
}

function resolveDetectionOdds(option: BetOption): number {
  const data = option.data as { detectionOdds?: number } | null | undefined;
  const fromData = Number(data?.detectionOdds);
  if (Number.isFinite(fromData) && fromData > 1)
    return fromData;
  return option.odds;
}

function resolveMarketId(option: BetOption, tokenId: string): string {
  const fromData = option.data as { marketId?: string } | null | undefined;
  const cached = getVenueOddsEntry(PLATFORM, tokenId)?.marketId;
  return String(fromData?.marketId ?? cached ?? "").trim();
}

function isPredictFunBuyCheckData(data: unknown): data is PredictFunBuyCheckData {
  if (!data || typeof data !== "object")
    return false;
  const row = data as PredictFunBuyCheckData;
  return row.side === "BUY"
    && Boolean(row.tokenId)
    && Boolean(row.marketId)
    && Number.isFinite(row.bookPrice) && row.bookPrice > 0
    && Number.isFinite(row.bookFetchedAt) && row.bookFetchedAt > 0;
}

function filterAsksByMaxPrice(
  asks: Array<[number, number]>,
  maxPrice: number,
): Array<[number, number]> {
  return asks.filter(([price, size]) => {
    const p = Number(price);
    const s = Number(size);
    return Number.isFinite(p) && p > 0 && p <= maxPrice + 1e-9
      && Number.isFinite(s) && s > 0;
  });
}

async function resolveExecutableBuy(
  _tokenId: string,
  marketId: string,
  detectionOdds: number,
  _apiBetMoney: number,
  maxPrice: number,
): Promise<{
  bookPrice: number;
  bookOdds: number;
  bookFetchedAt: number;
  feeRateBps: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
}> {
  if (!isValidPredictClobPrice(maxPrice))
    throw new Error(`无效检测价 ${maxPrice}（赔率 ${detectionOdds}）`);
  if (!marketId)
    throw new Error("缺少 Predict.fun marketId（请确认采集器已写入 fo）");

  const [book, market] = await Promise.all([
    fetchPredictOrderbook(marketId),
    fetchPredictMarket(marketId),
  ]);
  if (!book)
    throw new Error(`Predict.fun orderbook 为空（market ${marketId}）`);

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
  };
}

async function loadPredictSdk() {
  const [sdk, ethers] = await Promise.all([
    import("@predictdotfun/sdk"),
    import("ethers"),
  ]);
  return { sdk, ethers };
}

async function createPredictMarketBuyOrder(params: {
  credentials: { privateKey: string; predictAccount?: string };
  tokenId: string;
  marketId: string;
  apiBetMoney: number;
  maxSlippageBps?: bigint;
  feeRateBps: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
}): Promise<{
  body: Record<string, unknown>;
  jwt: string;
  signerAddress: string;
}> {
  const { sdk, ethers } = await loadPredictSdk();
  const { Wallet } = ethers;
  const {
    OrderBuilder,
    ChainId,
    Side,
  } = sdk;

  const signer = new Wallet(params.credentials.privateKey);
  const predictAccount = String(params.credentials.predictAccount ?? "").trim();
  const chainId = resolvePredictChainId(PREDICT_FUN_API) === 97
    ? ChainId.BnbTestnet
    : ChainId.BnbMainnet;
  const orderBuilder = predictAccount
    ? await OrderBuilder.make(chainId, signer, { predictAccount })
    : await OrderBuilder.make(chainId, signer);

  const signerAddress = predictAccount || await signer.getAddress();
  const jwt = await fetchPredictFunJwt({
    signer: signerAddress,
    signMessage: async (message) => {
      if (predictAccount && typeof orderBuilder.signPredictAccountMessage === "function")
        return orderBuilder.signPredictAccountMessage(message);
      return signer.signMessage(message);
    },
  });

  const bookRaw = await fetchPredictOrderbook(params.marketId);
  if (!bookRaw?.asks?.length)
    throw new Error("下单前 orderbook 无 asks");

  const book = {
    marketId: Number(params.marketId),
    updateTimestampMs: Number(bookRaw.updateTimestampMs ?? Date.now()),
    asks: bookRaw.asks ?? [],
    bids: bookRaw.bids ?? [],
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

  const maker = predictAccount || await signer.getAddress();
  const order = orderBuilder.buildOrder("MARKET", {
    maker,
    signer: maker,
    side: Side.BUY,
    tokenId: params.tokenId,
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    nonce: 0n,
    feeRateBps: params.feeRateBps,
  });

  const typedData = orderBuilder.buildTypedData(order, {
    isNegRisk: params.isNegRisk,
    isYieldBearing: params.isYieldBearing,
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

  return {
    body,
    jwt,
    signerAddress: maker,
  };
}

export function isPredictFunOrderAccepted(
  result: PredictCreateOrderResponse | null | undefined,
): boolean {
  if (!result?.success)
    return false;
  const orderId = String(result.data?.orderId ?? "").trim();
  return orderId.length > 0;
}

export const predictFunProvider: PlatformProvider = {
  async checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption> {
    void account;
    const tokenId = String(option.itemId ?? "").trim();
    const marketId = resolveMarketId(option, tokenId);
    const detectionOdds = resolveDetectionOdds(option);
    const maxPrice = resolvePredictFunDetectionMaxPrice(option, detectionOdds);
    const apiBetMoney = resolveApiBetMoney(option);

    try {
      const prior = option.data;
      const now = Date.now();
      if (
        isPredictFunBuyCheckData(prior)
        && prior.tokenId === tokenId
        && prior.marketId === marketId
        && prior.detectionOdds === detectionOdds
        && prior.detectionMaxPrice === maxPrice
        && prior.apiBetMoney === apiBetMoney
        && now - prior.bookFetchedAt <= PRECHECK_BOOK_REUSE_MS
      ) {
        option.odds = prior.odds;
        option.newOdds = prior.odds;
        return option;
      }

      const resolved = await resolveExecutableBuy(
        tokenId,
        marketId,
        detectionOdds,
        apiBetMoney,
        maxPrice,
      );
      option.odds = resolved.bookOdds;
      option.newOdds = resolved.bookOdds;
      option.data = {
        tokenId,
        marketId,
        odds: resolved.bookOdds,
        detectionOdds,
        detectionMaxPrice: maxPrice,
        detectionClobPrice: maxPrice,
        bookPrice: resolved.bookPrice,
        betMoney: option.betMoney,
        apiBetMoney,
        side: "BUY",
        bookFetchedAt: resolved.bookFetchedAt,
        feeRateBps: resolved.feeRateBps,
        isNegRisk: resolved.isNegRisk,
        isYieldBearing: resolved.isYieldBearing,
      } satisfies PredictFunBuyCheckData;
    }
    catch (err) {
      option.checkError = err instanceof Error ? err.message : String(err);
      option.data = null;
    }
    return option;
  },

  async betting(account: PlatformAccount, option: BetOption): Promise<BetResult> {
    const beginTime = Date.now();
    const master = resolvePredictFunMasterCredentials(account);
    if (!master?.privateKey)
      return new BetResult(PLATFORM, false, "未配置 Predict.fun 运营主号（env 或管理员平台账号 token）");

    const check = option.data as PredictFunBuyCheckData | null | undefined;
    if (!isPredictFunBuyCheckData(check))
      return new BetResult(PLATFORM, false, "请先通过 checkBet 预检");

    const tokenId = String(option.itemId ?? "").trim();
    const detectionOdds = resolveDetectionOdds(option);
    const maxPrice = resolvePredictFunDetectionMaxPrice(option, detectionOdds);
    const apiBetMoney = resolveApiBetMoney(option);

    try {
      const fresh = await resolveExecutableBuy(
        tokenId,
        check.marketId,
        detectionOdds,
        apiBetMoney,
        maxPrice,
      );
      option.newOdds = fresh.bookOdds;

      const { body, jwt } = await createPredictMarketBuyOrder({
        credentials: {
          privateKey: master.privateKey,
          predictAccount: master.predictAccount,
        },
        tokenId,
        marketId: check.marketId,
        apiBetMoney,
        feeRateBps: check.feeRateBps,
        isNegRisk: check.isNegRisk,
        isYieldBearing: check.isYieldBearing,
      });

      const result = await predictFunHttpPost<PredictCreateOrderResponse>(
        `${PREDICT_FUN_API}/v1/orders`,
        body,
        predictFunJwtHeaders(jwt),
      );

      if (!isPredictFunOrderAccepted(result)) {
        const code = String(result?.data?.code ?? "").trim();
        return new BetResult(
          PLATFORM,
          false,
          code
            ? `Predict.fun 下单未受理（code: ${code}）`
            : "Predict.fun FOK 订单未成交",
          body,
          result,
        );
      }

      const orderId = String(result.data?.orderId ?? "").trim();
      const bet = new BetResult(
        PLATFORM,
        true,
        `${orderId} / ${result.data?.code ?? "accepted"} / 待 wallet 事件确认`,
        body,
        result,
      );
      bet.orderId = orderId || null;
      bet.pending = true;
      bet.beginTime = beginTime;
      return bet;
    }
    catch (err) {
      return new BetResult(
        PLATFORM,
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
  },

  async resolveLegOutcome(_account, result) {
    if (!result?.success || !result.orderId)
      return { orders: [], settlement: "unfilled" as const };
    // TODO: predictWalletEvents WS 或 GET /v1/orders 确认成交
    return { orders: [], settlement: "timeout" as const };
  },
};

export { detectionMaxPriceFromOdds };
