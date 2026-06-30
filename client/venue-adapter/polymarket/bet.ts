import type { AccountBalanceResult, PlatformProvider, VenueOrder } from "@venue/contract";
import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { accountMultiplyScale, POLYMARKET_MIN_VENUE_STAKE, scaleVenueMoney, venueStakeFromBetMoney } from "@changmen/shared/account_multiply";
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
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

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

function calculateBuyMarketLimitPrice(
  asks: PolymarketOrderOptions["asks"],
  amountUsdc: number,
  minOrderSize: number,
  diagnostic: Omit<PolymarketOrderDiagnostic, "availableUsdc" | "asks">,
): number {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0)
    throw new Error(`无效投注金额 ${amountUsdc}`);
  const baseDiag = {
    ...diagnostic,
    availableUsdc: availableUsdc(asks),
    asks,
  };
  let remaining = amountUsdc;
  for (const level of asks) {
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

function scalePolymarketVenueOrders(orders: VenueOrder[], multiply: number): VenueOrder[] {
  return orders.map(order => ({
    ...order,
    betMoney: scaleVenueMoney(order.betMoney, multiply),
    reward: scaleVenueMoney(order.reward, multiply),
    money: scaleVenueMoney(order.money, multiply),
  }));
}

function resolvePolymarketApiBetMoney(account: PlatformAccount, option: BetOption): number {
  const fromCheck = Number((option.data as { apiBetMoney?: number } | undefined)?.apiBetMoney);
  if (Number.isFinite(fromCheck) && fromCheck > 0)
    return fromCheck;
  return venueStakeFromBetMoney(option.betMoney, account.multiply, POLYMARKET_MIN_VENUE_STAKE);
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
        balance: scaleVenueMoney(balance, account.multiply),
        currency: "USDT",
      };
    } catch (err) {
      console.warn("[Polymarket] getBalance failed", err);
      return undefined;
    }
  },

  async getOrders(account: PlatformAccount) {
    try {
      const multiply = accountMultiplyScale(account.multiply);
      const orders = await fetchPolymarketVenueOrders(account);
      return scalePolymarketVenueOrders(orders, multiply);
    }
    catch (err) {
      console.warn("[Polymarket] getOrders failed", err);
      return [];
    }
  },

  async checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption> {
    const apiBetMoney = venueStakeFromBetMoney(option.betMoney, account.multiply, POLYMARKET_MIN_VENUE_STAKE);
    option.data = {
      tokenId: option.itemId,
      odds: option.odds,
      betMoney: option.betMoney,
      apiBetMoney,
      side: "BUY",
      temporaryPass: true,
    };
    return option;
  },

  async betting(account: PlatformAccount, option: BetOption): Promise<BetResult> {
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

    // displayedPrice = probability = 1 / decimal_odds，真正 FOK 限价由订单簿深度决定。
    const displayedPrice = Math.round((1 / option.odds) * 10000) / 10000;
    if (!displayedPrice || displayedPrice <= 0 || displayedPrice >= 1)
      return new BetResult("Polymarket", false, `无效赔率 ${option.odds}`);

    const tokenId = option.itemId;
    const apiBetMoney = resolvePolymarketApiBetMoney(account, option);

    try {
      const orderOptions = await fetchOrderOptions(gateway, tokenId);
      const price = calculateBuyMarketLimitPrice(
        orderOptions.asks,
        apiBetMoney,
        orderOptions.minOrderSize,
        {
          tokenId,
          amountUsdc: apiBetMoney,
          displayedOdds: option.odds,
          displayedPrice,
          minOrderSize: orderOptions.minOrderSize,
        },
      );
      option.newOdds = Math.round((1 / price) * 10000) / 10000;
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

      if (!result?.success) {
        const diagnostic = diagnosticLines({
          tokenId,
          amountUsdc: apiBetMoney,
          displayedOdds: option.odds,
          displayedPrice,
          limitPrice: price,
          shares: apiBetMoney / price,
          minOrderSize: orderOptions.minOrderSize,
          availableUsdc: availableUsdc(orderOptions.asks),
          asks: orderOptions.asks,
        }).join("\n");
        return new BetResult(
          "Polymarket", false,
          `${result?.errorMsg || "FOK 订单未成交（无足够流动性）"}\n${diagnostic}`,
          orderBody, result,
        );
      }

      const msg = `${result.orderID} / ${result.status} / 成交 ${result.takingAmount ?? "?"} tokens`;
      const bet = new BetResult("Polymarket", true, msg, orderBody, result);
      bet.beginTime = beginTime;
      return bet;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new BetResult("Polymarket", false, msg);
    }
  },
};
