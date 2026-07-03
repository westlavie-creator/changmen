import type { PlatformAccount } from "@/models/platformAccount";
import { POLYMARKET_CLOB_API } from "./api";
import { resolvePolymarketBuilderCode } from "./builder";
import {
  buildL2Headers,
  parseTokenConfig,
  resolveApiCreds,
  resolveFunder,
  resolvePrivateKey,
  type PolymarketTokenConfig,
} from "./l2Auth";
import {
  decimalOddsFromProbability,
  estimatePolymarketSellProceedsUsdc,
  type PolymarketBidLevel,
} from "./parse";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";
import { isPolymarketOrderAccepted, polymarketOrderFailureMessage } from "./bet";
import { isPolymarketDelayedPending, settlePolymarketDelayedOrder } from "./orderStatus";
import { registerPolymarketOrderWatch } from "./userWs";

const ORDER_PATH = "/order";
const ORDER_BOOK_PATH = "/book";

type Hex = `0x${string}`;
type TickSize = "0.1" | "0.01" | "0.001" | "0.0001";

interface PolymarketOrderBookResponse {
  tick_size?: string | number;
  minimum_tick_size?: string | number;
  min_order_size?: string | number;
  neg_risk?: boolean;
  bids?: Array<{ price?: string | number; size?: string | number }>;
}

export interface PolymarketSellOrderOptions {
  tickSize: TickSize;
  minOrderSize: number;
  negRisk: boolean;
  bids: PolymarketBidLevel[];
}

export interface PolymarketSellQuote {
  tokenId: string;
  shares: number;
  stakeUsdc: number;
  bestBid: number;
  sellOdds: number;
  proceedsUsdc: number;
  profitUsdc: number;
  canSell: boolean;
}

export interface PolymarketSellParams {
  tokenId: string;
  shares: number;
  stakeUsdc?: number;
  /** condition_id，体育 delayed 卖单 User WS 订阅 */
  conditionId?: string;
}

interface PolymarketOrderResponse {
  success?: boolean;
  errorMsg?: string;
  orderID?: string;
  status?: string;
  makingAmount?: string;
  takingAmount?: string;
}

function resolveSdkSignatureType(value: string | number | undefined): number {
  const numeric = Number(value ?? 0);
  return [1, 2, 3].includes(numeric) ? numeric : 0;
}

function normalizeTickSize(value: string | number | undefined): TickSize {
  const tick = String(value ?? "").trim();
  if (tick === "0.1" || tick === "0.01" || tick === "0.001" || tick === "0.0001")
    return tick;
  throw new Error(`Polymarket 返回了不支持的 tick_size: ${tick || "空"}`);
}

function parseBidLevels(book: PolymarketOrderBookResponse | null | undefined): PolymarketBidLevel[] {
  return (book?.bids ?? [])
    .map(level => ({
      price: Number(level.price),
      size: Number(level.size),
    }))
    .filter(level =>
      Number.isFinite(level.price) &&
      Number.isFinite(level.size) &&
      level.price > 0 &&
      level.price < 1 &&
      level.size > 0,
    )
    .sort((a, b) => b.price - a.price);
}

export async function fetchPolymarketSellOrderOptions(
  gateway: string,
  tokenId: string,
): Promise<PolymarketSellOrderOptions> {
  const params = new URLSearchParams({ token_id: tokenId });
  const book = await polymarketPluginGet<PolymarketOrderBookResponse>(
    `${gateway}${ORDER_BOOK_PATH}?${params.toString()}`,
  );
  return {
    tickSize: normalizeTickSize(book?.tick_size ?? book?.minimum_tick_size),
    minOrderSize: Number(book?.min_order_size) || 0,
    negRisk: Boolean(book?.neg_risk),
    bids: parseBidLevels(book),
  };
}

/** FOK 卖出限价：扫 bids 时接受的最低成交价 */
export function calculateSellMarketLimitPrice(
  bids: PolymarketBidLevel[],
  shares: number,
  minOrderSize: number,
): number {
  if (!Number.isFinite(shares) || shares <= 0)
    throw new Error(`无效卖出份数 ${shares}`);
  if (!bids.length)
    throw new Error("Polymarket 盘口无买单，无法卖出");
  if (minOrderSize > 0 && shares + 1e-9 < minOrderSize)
    throw new Error(`Polymarket 卖出份数低于最小 ${minOrderSize}`);

  let remaining = shares;
  for (const level of bids) {
    if (level.size + 1e-9 >= remaining)
      return level.price;
    remaining -= level.size;
  }
  throw new Error("Polymarket FOK 卖出深度不足");
}

export function buildPolymarketSellQuote(
  tokenId: string,
  shares: number,
  stakeUsdc: number,
  bids: PolymarketBidLevel[],
  minOrderSize = 0,
): PolymarketSellQuote {
  const bestBid = bids[0]?.price ?? 0;
  const proceedsUsdc = estimatePolymarketSellProceedsUsdc(bids, shares);
  const canSell = shares > 0
    && bestBid > 0
    && proceedsUsdc > 0
    && (minOrderSize <= 0 || shares + 1e-9 >= minOrderSize);
  return {
    tokenId,
    shares,
    stakeUsdc,
    bestBid,
    sellOdds: decimalOddsFromProbability(bestBid),
    proceedsUsdc,
    profitUsdc: canSell
      ? Math.round((proceedsUsdc - stakeUsdc) * 10000) / 10000
      : 0,
    canSell,
  };
}

async function createPolymarketSellOrderBody(
  gateway: string,
  privateKey: Hex,
  creds: ReturnType<typeof resolveApiCreds>,
  config: PolymarketTokenConfig,
  tokenId: string,
  price: number,
  shares: number,
  orderOptions: PolymarketSellOrderOptions,
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
  client.tickSizes[tokenId] = orderOptions.tickSize;
  client.negRisk[tokenId] = orderOptions.negRisk;
  client.feeInfos[tokenId] = { rate: 0, exponent: 0 };
  client.builderFeeRates[builderCode] = { maker: 0, taker: 0 };
  const signedOrder = await client.createMarketOrder({
    tokenID: tokenId,
    price,
    amount: shares,
    side: clob.Side.SELL,
  }, orderOptions);
  if (!clob.isV2Order(signedOrder))
    throw new Error("Polymarket SDK 未生成 CLOB v2 卖单");
  return clob.orderToJsonV2(signedOrder, creds.apiKey!, clob.OrderType.FOK, false, false);
}

export interface PolymarketSellResult {
  success: boolean;
  message: string;
  orderId?: string;
  proceedsUsdc?: number;
  quote?: PolymarketSellQuote;
  /** 体育 delayed：CLOB 已受理，待最终成交确认 */
  pending?: boolean;
}

export async function quotePolymarketSell(
  account: PlatformAccount,
  params: PolymarketSellParams,
): Promise<PolymarketSellQuote> {
  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const tokenId = String(params.tokenId ?? "").trim();
  const shares = Number(params.shares);
  const stakeUsdc = Number(params.stakeUsdc ?? 0);
  if (!tokenId)
    throw new Error("缺少 tokenId");
  if (!Number.isFinite(shares) || shares <= 0)
    throw new Error("无效持仓份数");
  const orderOptions = await fetchPolymarketSellOrderOptions(gateway, tokenId);
  return buildPolymarketSellQuote(
    tokenId,
    shares,
    stakeUsdc,
    orderOptions.bids,
    orderOptions.minOrderSize,
  );
}

export async function sellPolymarketPosition(
  account: PlatformAccount,
  params: PolymarketSellParams,
): Promise<PolymarketSellResult> {
  const config = parseTokenConfig(account.token);
  const creds = resolveApiCreds(config);
  const privateKey = resolvePrivateKey(config);
  if (!creds.address)
    return { success: false, message: "凭证缺少 walletAddress" };
  if (!privateKey)
    return { success: false, message: "缺少有效私钥" };
  if (!creds.apiKey || !creds.secret || !creds.passphrase)
    return { success: false, message: "凭证缺少用户 API Key" };

  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const tokenId = String(params.tokenId ?? "").trim();
  const shares = Number(params.shares);
  const stakeUsdc = Number(params.stakeUsdc ?? 0);
  if (!tokenId)
    return { success: false, message: "缺少 tokenId" };
  if (!Number.isFinite(shares) || shares <= 0)
    return { success: false, message: "无效持仓份数" };

  try {
    const orderOptions = await fetchPolymarketSellOrderOptions(gateway, tokenId);
    const quote = buildPolymarketSellQuote(
      tokenId,
      shares,
      stakeUsdc,
      orderOptions.bids,
      orderOptions.minOrderSize,
    );
    if (!quote.canSell)
      return { success: false, message: "当前无足够 bid 深度或低于最小卖出份数", quote };

    const price = calculateSellMarketLimitPrice(
      orderOptions.bids,
      shares,
      orderOptions.minOrderSize,
    );
    const orderBody = await createPolymarketSellOrderBody(
      gateway,
      privateKey,
      creds,
      config,
      tokenId,
      price,
      shares,
      orderOptions,
    );
    const bodyStr = JSON.stringify(orderBody);
    const headers = await buildL2Headers(
      creds.address,
      creds.apiKey,
      creds.secret,
      creds.passphrase,
      "POST",
      ORDER_PATH,
      bodyStr,
    );
    const result = await polymarketPluginPost<PolymarketOrderResponse>(
      `${gateway}${ORDER_PATH}`,
      orderBody,
      { headers },
    );
    if (!isPolymarketOrderAccepted(result)) {
      return {
        success: false,
        message: polymarketOrderFailureMessage(result, "FOK 卖单未成交"),
        quote,
      };
    }
    const orderId = String(result.orderID ?? "").trim() || undefined;
    const pending = isPolymarketDelayedPending(result);
    if (pending && orderId) {
      const conditionId = String(params.conditionId ?? "").trim();
      if (conditionId) {
        registerPolymarketOrderWatch(account, orderId, { conditionId });
      }
      else {
        console.warn(
          "[Polymarket] delayed 卖单缺少 conditionId，User WS 未订阅；确认仅走 REST",
        );
      }
    }
    const taking = Number(result?.takingAmount);
    const proceedsUsdc = Number.isFinite(taking) && taking > 0
      ? Math.round(taking * 10000) / 10000
      : quote.proceedsUsdc;
    const msg = pending
      ? `${orderId} / ${result.status} / 待确认（体育延迟撮合中）`
      : `${orderId} / ${result.status} / 卖出 ${shares} 份`;
    return {
      success: true,
      message: msg,
      orderId,
      proceedsUsdc,
      quote,
      pending,
    };
  }
  catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** delayed 卖单：复用买单 settle（order 行 + trades + User WS） */
export async function settlePolymarketSellOrder(
  account: PlatformAccount,
  orderId: string,
) {
  return settlePolymarketDelayedOrder(account, orderId);
}
