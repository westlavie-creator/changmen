import type { AccountBalanceResult, PlatformProvider, VenueOrder } from "@venue/contract";
import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  POLYMARKET_MIN_VENUE_STAKE,
  scaleUsdtToCnyDisplay,
} from "@changmen/shared/account_multiply";
import { POLYMARKET_CLOB_API } from "./api";
import { resolvePolymarketBuilderCode } from "./builder";
import {
  buildL2Headers,
  buildL2HeadersFromAccount,
  parseTokenConfig,
  resolveApiCreds,
  resolveFunder,
  resolvePrivateKey,
  resolveSignatureType,
  type PolymarketTokenConfig,
} from "./l2Auth";
import { fetchPolymarketVenueOrders } from "./orders";
import { isPolymarketDelayedPending } from "./orderStatus";
import { registerPolymarketOrderWatch } from "./userWs";
import { resolvePolymarketBetBlockReason } from "./pmBetGuard";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

export { isPolymarketDelayedPending } from "./orderStatus";
export {
  fetchPolymarketOrderRow,
  formatPolymarketSettlementMessage,
  pollPolymarketDelayedOrder,
  settlePolymarketDelayedOrder,
} from "./orderStatus";

const BALANCE_PATH = "/balance-allowance";
const ORDER_PATH = "/order";
const ORDER_BOOK_PATH = "/book";

const COLLATERAL_DECIMALS = 1_000_000;
type Hex = `0x${string}`;
type TickSize = "0.1" | "0.01" | "0.001" | "0.0001";

interface PolymarketBalanceAllowanceResponse {
  balance?: string | number;
  allowance?: string | number;
}

interface PolymarketOrderResponse {
  success?: boolean;
  errorMsg?: string;
  orderID?: string;
  status?: string;
  makingAmount?: string;
  takingAmount?: string;
  transactionsHashes?: string[];
  tradeIDs?: string[];
}

/** FOK BUY 成交：对齐 Polymarket 文档与官网仓位（status=matched 且 takingAmount>0） */
export function isPolymarketFokBuyFilled(result: PolymarketOrderResponse | null | undefined): boolean {
  if (!result?.success)
    return false;
  const status = String(result.status ?? "").trim().toLowerCase();
  if (status !== "matched")
    return false;
  const taking = Number(result.takingAmount);
  return Number.isFinite(taking) && taking > 0;
}

/** CLOB 已受理：含 delayed（链上延迟成交，勿重复 submit） */
export function isPolymarketOrderAccepted(result: PolymarketOrderResponse | null | undefined): boolean {
  if (isPolymarketFokBuyFilled(result))
    return true;
  if (!result?.success)
    return false;
  const status = String(result.status ?? "").trim().toLowerCase();
  const orderId = String(result.orderID ?? "").trim();
  return status === "delayed" && orderId.length > 0;
}

export function polymarketOrderFailureMessage(
  result: PolymarketOrderResponse | null | undefined,
  fallback: string,
): string {
  const status = String(result?.status ?? "").trim() || "未知";
  const errorMsg = String(result?.errorMsg ?? "").trim();
  const parts = [errorMsg || fallback, `status: ${status}`];
  if (result?.orderID)
    parts.push(`orderID: ${result.orderID}`);
  const taking = result?.takingAmount;
  if (taking !== undefined && taking !== "")
    parts.push(`takingAmount: ${taking}`);
  return parts.join(" / ");
}

interface PolymarketOrderBookResponse {
  tick_size?: string | number;
  minimum_tick_size?: string | number;
  min_order_size?: string | number;
  neg_risk?: boolean;
  asks?: Array<{ price?: string | number; size?: string | number }>;
}

// ---- official CLOB v2 order helpers ----

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

interface PolymarketOrderOptions {
  tickSize: TickSize;
  minOrderSize: number;
  negRisk: boolean;
  asks: Array<{ price: number; size: number }>;
}

interface PolymarketOrderDiagnostic {
  tokenId: string;
  amountUsdc: number;
  displayedOdds: number;
  displayedPrice: number;
  limitPrice?: number;
  minOrderSize: number;
  shares?: number;
  availableUsdc: number;
  asks: PolymarketOrderOptions["asks"];
}

async function fetchOrderOptions(gateway: string, tokenId: string): Promise<PolymarketOrderOptions> {
  const params = new URLSearchParams({ token_id: tokenId });
  const book = await polymarketPluginGet<PolymarketOrderBookResponse>(
    `${gateway}${ORDER_BOOK_PATH}?${params.toString()}`,
  );
  return {
    tickSize: normalizeTickSize(book?.tick_size ?? book?.minimum_tick_size),
    minOrderSize: Number(book?.min_order_size) || 0,
    negRisk: Boolean(book?.neg_risk),
    asks: (book?.asks ?? [])
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
      .sort((a, b) => a.price - b.price),
  };
}

function fmt(value: number, decimals = 4): string {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)).toString() : "N/A";
}

function asksPreview(asks: PolymarketOrderOptions["asks"]): string {
  if (!asks.length)
    return "无 asks 卖单";
  return asks.slice(0, 5)
    .map((level, index) => `${index + 1}. ${fmt(level.price, 4)} x ${fmt(level.size, 2)} = ${fmt(level.price * level.size, 2)} USDC`)
    .join("\n");
}

function availableUsdc(asks: PolymarketOrderOptions["asks"]): number {
  return asks.reduce((sum, level) => sum + level.price * level.size, 0);
}

function diagnosticLines(diag: PolymarketOrderDiagnostic): string[] {
  const bestAsk = diag.asks[0];
  const lines = [
    "【订单】",
    `- 金额：${fmt(diag.amountUsdc, 2)} USDC`,
    `- 页面赔率：${fmt(diag.displayedOdds, 4)}（价格 ${fmt(diag.displayedPrice, 4)}）`,
    `- tokenId：${diag.tokenId}`,
    "",
    "【盘口】",
    bestAsk
      ? `- 最佳卖价：${fmt(bestAsk.price, 4)}（赔率 ${fmt(1 / bestAsk.price, 4)}），数量 ${fmt(bestAsk.size, 2)}`
      : "- 最佳卖价：无",
    `- 可立即成交：${fmt(diag.availableUsdc, 2)} USDC`,
    `- 最小下单份数：${diag.minOrderSize || "未知"}`,
    "- 前 5 档 asks：",
    asksPreview(diag.asks),
  ];
  if (diag.limitPrice) {
    lines.splice(4, 0, `- FOK 限价：${fmt(diag.limitPrice, 4)}（赔率 ${fmt(1 / diag.limitPrice, 4)}）`);
  }
  if (diag.shares !== undefined) {
    lines.splice(diag.limitPrice ? 5 : 4, 0, `- 预计买入：${fmt(diag.shares, 4)} 份`);
  }
  return lines;
}

function detectionMaxPrice(detectionOdds: number): number {
  return Math.round((1 / detectionOdds) * 10000) / 10000;
}

function calculateBuyMarketLimitPrice(
  asks: PolymarketOrderOptions["asks"],
  amountUsdc: number,
  minOrderSize: number,
  diagnostic: Omit<PolymarketOrderDiagnostic, "availableUsdc" | "asks">,
  maxPrice?: number,
): number {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0)
    throw new Error(`无效投注金额 ${amountUsdc}`);
  const bookAsks = maxPrice != null
    ? asks.filter(level => level.price <= maxPrice + 1e-9)
    : asks;
  const baseDiag = {
    ...diagnostic,
    availableUsdc: availableUsdc(bookAsks),
    asks: bookAsks,
  };
  if (maxPrice != null && !bookAsks.length) {
    const best = asks[0];
    throw new Error([
      "Polymarket 盘口价高于检测价，整单取消",
      ...diagnosticLines({
        ...baseDiag,
        availableUsdc: availableUsdc(asks),
        asks,
      }),
      "",
      "【说明】",
      best
        ? `- 最佳卖价 ${fmt(best.price, 4)}（赔率 ${fmt(1 / best.price, 4)}）高于检测价 ${fmt(maxPrice, 4)}（赔率 ${fmt(diagnostic.displayedOdds, 4)}）`
        : "- 盘口无卖单",
      "- 不会在高于套利检测价的位置 FOK 成交。",
    ].join("\n"));
  }
  let remaining = amountUsdc;
  for (const level of bookAsks) {
    const notional = level.price * level.size;
    if (notional >= remaining) {
      const shares = amountUsdc / level.price;
      if (minOrderSize > 0 && shares < minOrderSize) {
        const minAmount = minOrderSize * level.price;
        throw new Error([
          "Polymarket 下单金额低于最小份数",
          ...diagnosticLines({ ...baseDiag, limitPrice: level.price, shares }),
          "",
          "【建议】",
          `- 当前盘口至少约 ${fmt(minAmount, 2)} USDC 才能买满 ${minOrderSize} 份。`,
        ].join("\n"));
      }
      return level.price;
    }
    remaining -= notional;
  }
  throw new Error([
    "Polymarket FOK 盘口深度不足",
    ...diagnosticLines(baseDiag),
    "",
    "【说明】",
    "- FOK 要求整笔金额立即成交，否则整单取消。",
  ].join("\n"));
}

async function createPolymarketOrderBody(
  gateway: string,
  privateKey: Hex,
  creds: ReturnType<typeof resolveApiCreds>,
  config: PolymarketTokenConfig,
  tokenId: string,
  price: number,
  amount: number,
  orderOptions: PolymarketOrderOptions,
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
  // SDK 会 GET /fees/builder-fees/{code}；浏览器走插件，此处预填避免 ClobClient 直连 axios 卡住/跨域
  client.builderFeeRates[builderCode] = { maker: 0, taker: 0 };
  const signedOrder = await client.createMarketOrder({
    tokenID: tokenId,
    price,
    amount,
    side: clob.Side.BUY,
  }, orderOptions);
  if (!clob.isV2Order(signedOrder))
    throw new Error("Polymarket SDK 未生成 CLOB v2 订单");
  return clob.orderToJsonV2(signedOrder, creds.apiKey!, clob.OrderType.FOK, false, false);
}

// ---- balance helpers ----

function balanceQueryPathForSignature(signatureType: string | number | undefined): string {
  const params = new URLSearchParams({ asset_type: "COLLATERAL" });
  if (signatureType !== undefined && signatureType !== "")
    params.set("signature_type", String(signatureType));
  return `${BALANCE_PATH}?${params.toString()}`;
}


function parseCollateralBalance(raw: string | number | undefined): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value / COLLATERAL_DECIMALS : undefined;
}

function scalePolymarketVenueOrdersForDisplay(orders: VenueOrder[]): VenueOrder[] {
  return orders.map(order => ({
    ...order,
    betMoney: scaleUsdtToCnyDisplay(order.betMoney),
    reward: scaleUsdtToCnyDisplay(order.reward),
    money: scaleUsdtToCnyDisplay(order.money),
  }));
}

/** option.betMoney 已由 checkBetting → getBetMoney 换成 USDT 口径 */
function resolvePolymarketApiBetMoney(_account: PlatformAccount, option: BetOption): number {
  const fromCheck = Number((option.data as { apiBetMoney?: number } | undefined)?.apiBetMoney);
  if (Number.isFinite(fromCheck) && fromCheck > 0)
    return fromCheck;
  const stake = Math.floor(Number(option.betMoney) || 0);
  return Math.max(POLYMARKET_MIN_VENUE_STAKE, stake);
}

function resolvePolymarketDetectionOdds(option: BetOption): number {
  const data = option.data as { detectionOdds?: number } | null | undefined;
  const fromData = Number(data?.detectionOdds);
  if (Number.isFinite(fromData) && fromData > 1)
    return fromData;
  return option.odds;
}

async function resolvePolymarketExecutableBuy(
  gateway: string,
  tokenId: string,
  detectionOdds: number,
  apiBetMoney: number,
): Promise<{ price: number; bookOdds: number; orderOptions: PolymarketOrderOptions }> {
  const maxPrice = detectionMaxPrice(detectionOdds);
  if (!maxPrice || maxPrice <= 0 || maxPrice >= 1)
    throw new Error(`无效检测赔率 ${detectionOdds}`);
  const orderOptions = await fetchOrderOptions(gateway, tokenId);
  const price = calculateBuyMarketLimitPrice(
    orderOptions.asks,
    apiBetMoney,
    orderOptions.minOrderSize,
    {
      tokenId,
      amountUsdc: apiBetMoney,
      displayedOdds: detectionOdds,
      displayedPrice: maxPrice,
      minOrderSize: orderOptions.minOrderSize,
    },
    maxPrice,
  );
  return {
    price,
    bookOdds: Math.round((1 / price) * 10000) / 10000,
    orderOptions,
  };
}

// ---- provider ----

export const polymarketProvider: PlatformProvider = {
  async getBalance(account: PlatformAccount): Promise<AccountBalanceResult | undefined> {
    try {
      const config = parseTokenConfig(account.token);
      const gateway = account.gateway || POLYMARKET_CLOB_API;
      const requestPath = balanceQueryPathForSignature(resolveSignatureType(config));
      const headers = await buildL2HeadersFromAccount(account, "GET", BALANCE_PATH);
      if (!headers) return undefined;
      const data = await polymarketPluginGet<PolymarketBalanceAllowanceResponse>(
        `${gateway}${requestPath}`,
        { headers },
      );
      const balance = parseCollateralBalance(data?.balance);
      if (balance === undefined) return undefined;
      return {
        balance,
        currency: "USDT",
      };
    } catch (err) {
      console.warn("[Polymarket] getBalance failed", err);
      return undefined;
    }
  },

  async getOrders(account: PlatformAccount) {
    try {
      const orders = await fetchPolymarketVenueOrders(account);
      return scalePolymarketVenueOrdersForDisplay(orders);
    }
    catch (err) {
      console.warn("[Polymarket] getOrders failed", err);
      return [];
    }
  },

  async checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption> {
    const pmBlock = await resolvePolymarketBetBlockReason(option);
    if (pmBlock) {
      option.checkError = pmBlock;
      option.data = null;
      return option;
    }

    const prior = option.data as { detectionOdds?: number } | null | undefined;
    // 套利检测价：首次预检锁定 fo 赔率；PM 重检时沿用，FOK 限价不超过检测价
    const detectionOdds = Number(prior?.detectionOdds) > 1
      ? Number(prior!.detectionOdds)
      : option.odds;
    const apiBetMoney = resolvePolymarketApiBetMoney(account, option);
    const gateway = account.gateway || POLYMARKET_CLOB_API;
    const tokenId = option.itemId;
    try {
      const { price, bookOdds } = await resolvePolymarketExecutableBuy(
        gateway,
        tokenId,
        detectionOdds,
        apiBetMoney,
      );
      option.odds = bookOdds;
      option.newOdds = bookOdds;
      option.data = {
        tokenId,
        odds: bookOdds,
        detectionOdds,
        detectionMaxPrice: detectionMaxPrice(detectionOdds),
        bookPrice: price,
        betMoney: option.betMoney,
        apiBetMoney,
        side: "BUY",
      };
    }
    catch (err) {
      option.checkError = err instanceof Error ? err.message : String(err);
      option.data = null;
    }
    return option;
  },

  async betting(account: PlatformAccount, option: BetOption): Promise<BetResult> {
    const pmBlock = await resolvePolymarketBetBlockReason(option);
    if (pmBlock)
      return new BetResult("Polymarket", false, pmBlock);

    const beginTime = Date.now();
    const config = parseTokenConfig(account.token);
    const creds = resolveApiCreds(config);
    const privateKey = resolvePrivateKey(config);

    if (!creds.address)
      return new BetResult("Polymarket", false, "凭证缺少 walletAddress");
    if (!privateKey)
      return new BetResult("Polymarket", false, "缺少有效私钥（在 token 中加 0x 开头 privateKey 字段）");
    if (!creds.apiKey || !creds.secret || !creds.passphrase)
      return new BetResult("Polymarket", false, "凭证缺少用户 API Key（apiKey/secret/passphrase），请重新通过插件采集");

    const gateway = account.gateway || POLYMARKET_CLOB_API;

    const detectionOdds = resolvePolymarketDetectionOdds(option);
    const maxPrice = detectionMaxPrice(detectionOdds);
    if (!maxPrice || maxPrice <= 0 || maxPrice >= 1)
      return new BetResult("Polymarket", false, `无效检测赔率 ${detectionOdds}`);

    const tokenId = option.itemId;
    const apiBetMoney = resolvePolymarketApiBetMoney(account, option);

    try {
      const { price, bookOdds, orderOptions } = await resolvePolymarketExecutableBuy(
        gateway,
        tokenId,
        detectionOdds,
        apiBetMoney,
      );
      option.newOdds = bookOdds;
      const orderBody = await createPolymarketOrderBody(
        gateway,
        privateKey,
        creds,
        config,
        tokenId,
        price,
        apiBetMoney,
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
        const diagnostic = diagnosticLines({
          tokenId,
          amountUsdc: apiBetMoney,
          displayedOdds: detectionOdds,
          displayedPrice: maxPrice,
          limitPrice: price,
          shares: apiBetMoney / price,
          minOrderSize: orderOptions.minOrderSize,
          availableUsdc: availableUsdc(orderOptions.asks),
          asks: orderOptions.asks,
        }).join("\n");
        const fallback = result?.success
          ? "订单已受理但未成交（status 非 matched/delayed 或 takingAmount 为空）"
          : "FOK 订单未成交（无足够流动性）";
        return new BetResult(
          "Polymarket", false,
          `${polymarketOrderFailureMessage(result, fallback)}\n${diagnostic}`,
          orderBody, result,
        );
      }

      const filled = isPolymarketFokBuyFilled(result);
      const pending = isPolymarketDelayedPending(result);
      const msg = filled
        ? `${result.orderID} / ${result.status} / 成交 ${result.takingAmount} tokens`
        : pending
          ? `${result.orderID} / ${result.status} / 待确认（体育延迟撮合中）`
          : `${result.orderID} / ${result.status} / 已受理待链上确认`;
      const bet = new BetResult("Polymarket", true, msg, orderBody, result);
      bet.orderId = String(result.orderID ?? "").trim() || null;
      bet.pending = pending;
      bet.beginTime = beginTime;
      if (pending && bet.orderId) {
        const conditionId = String(option.betId ?? "").trim();
        if (conditionId)
          registerPolymarketOrderWatch(account, bet.orderId, { conditionId });
      }
      return bet;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new BetResult("Polymarket", false, msg);
    }
  },
};
