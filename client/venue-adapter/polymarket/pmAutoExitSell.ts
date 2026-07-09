/**
 * [changmen 扩展] 买单确认成交后自动挂 GTC 止盈卖单。
 * 价格按官网 tick 对齐，在 [0.99, 0.995] 合法档位中随机。
 * @see https://docs.polymarket.com/trading/orders/overview
 */
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
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
import { parsePolymarketBuyOrderFill } from "./orders";
import {
  normalizePolymarketTickSize,
  pickPolymarketAutoExitSellPrice,
  type PolymarketTickSize,
} from "./pmTickPrice";
import { ensurePolymarketHeartbeat } from "./pmHeartbeat";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

const ORDER_PATH = "/order";
const ORDER_BOOK_PATH = "/book";
/** [Polymarket 可证实] 用户 open orders */
const OPEN_ORDERS_PATH = "/data/orders";

type Hex = `0x${string}`;

/** 同一买单只尝试挂一次止盈卖单（进程内） */
const scheduledBuyOrderIds = new Set<string>();

interface PolymarketOrderBookResponse {
  tick_size?: string | number;
  minimum_tick_size?: string | number;
  min_order_size?: string | number;
  neg_risk?: boolean;
}

interface PolymarketOrderResponse {
  success?: boolean;
  errorMsg?: string;
  orderID?: string;
  status?: string;
  makingAmount?: string;
  takingAmount?: string;
}

interface PolymarketOpenOrderRow {
  id?: string;
  asset_id?: string;
  assetId?: string;
  side?: string;
  status?: string;
  original_size?: string | number;
  size_matched?: string | number;
  price?: string | number;
}

export interface PolymarketAutoExitSellResult {
  ok: boolean;
  buyOrderId: string;
  sellOrderId?: string;
  price?: number;
  shares?: number;
  tickSize?: PolymarketTickSize;
  status?: string;
  /** 已有 open SELL，跳过重复挂单 */
  skippedDuplicate?: boolean;
  error?: string;
}

/** 扩展页开关：undefined/true = 开；false = 关 */
export function isPolymarketAutoExitSellEnabled(enabled: boolean | undefined): boolean {
  return enabled !== false;
}

function resolveSdkSignatureType(value: string | number | undefined): number {
  const numeric = Number(value ?? 0);
  return [1, 2, 3].includes(numeric) ? numeric : 0;
}

async function fetchSellOrderOptions(gateway: string, tokenId: string): Promise<{
  tickSize: PolymarketTickSize;
  minOrderSize: number;
  negRisk: boolean;
}> {
  const params = new URLSearchParams({ token_id: tokenId });
  const book = await polymarketPluginGet<PolymarketOrderBookResponse>(
    `${gateway}${ORDER_BOOK_PATH}?${params.toString()}`,
  );
  return {
    tickSize: normalizePolymarketTickSize(book?.tick_size ?? book?.minimum_tick_size),
    minOrderSize: Number(book?.min_order_size) || 0,
    negRisk: Boolean(book?.neg_risk),
  };
}

function normalizeOpenOrdersPayload(raw: unknown): PolymarketOpenOrderRow[] {
  if (Array.isArray(raw))
    return raw as PolymarketOpenOrderRow[];
  if (raw && typeof raw === "object") {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data))
      return data as PolymarketOpenOrderRow[];
  }
  return [];
}

function isLiveSellOrder(row: PolymarketOpenOrderRow, tokenId: string): boolean {
  const side = String(row.side ?? "").toUpperCase();
  if (side !== "SELL")
    return false;
  const asset = String(row.asset_id ?? row.assetId ?? "").trim();
  if (asset !== tokenId)
    return false;
  const status = String(row.status ?? "").toUpperCase();
  // 官方 open 列表通常已是 live；兼容带 status 字段的响应
  if (status && !status.includes("LIVE") && status !== "ORDER_STATUS_LIVE")
    return false;
  const original = Number(row.original_size);
  const matched = Number(row.size_matched) || 0;
  if (Number.isFinite(original) && original > 0 && matched + 1e-12 >= original)
    return false;
  return true;
}

/**
 * 查该 token 是否已有未成交 SELL（防刷新重复挂）。
 * 查询失败时返回 null（不阻断挂单，仍靠内存幂等）。
 */
export async function findExistingPolymarketOpenSell(params: {
  account: PlatformAccount;
  tokenId: string;
  gateway?: string;
  address: string;
  apiKey: string;
  secret: string;
  passphrase: string;
}): Promise<{ orderId: string; price?: number } | null> {
  const tokenId = String(params.tokenId ?? "").trim();
  if (!tokenId)
    return null;
  const gateway = params.gateway || POLYMARKET_CLOB_API;
  const qs = new URLSearchParams({ asset_id: tokenId });
  const path = `${OPEN_ORDERS_PATH}?${qs.toString()}`;
  const headers = await buildL2Headers(
    params.address,
    params.apiKey,
    params.secret,
    params.passphrase,
    "GET",
    path,
  );
  try {
    const raw = await polymarketPluginGet<unknown>(`${gateway}${path}`, { headers });
    const rows = normalizeOpenOrdersPayload(raw);
    const hit = rows.find(r => isLiveSellOrder(r, tokenId));
    if (!hit)
      return null;
    const orderId = String(hit.id ?? "").trim();
    if (!orderId)
      return null;
    const price = Number(hit.price);
    return {
      orderId,
      price: Number.isFinite(price) ? price : undefined,
    };
  }
  catch (err) {
    console.warn(
      "[Polymarket] open-orders check failed (continue place):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function createPolymarketGtcSellOrderBody(
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

  const signedOrder = await client.createOrder({
    tokenID: tokenId,
    price,
    size: shares,
    side: clob.Side.SELL,
  }, {
    tickSize: orderOptions.tickSize,
    negRisk: orderOptions.negRisk,
  });
  if (!clob.isV2Order(signedOrder))
    throw new Error("Polymarket SDK 未生成 CLOB v2 卖单");
  return clob.orderToJsonV2(signedOrder, creds.apiKey!, clob.OrderType.GTC, false, false);
}

/**
 * 买单已确认成交后挂 GTC SELL。
 * @param shares 成交份数（人类可读，非 micro）
 */
export async function placePolymarketAutoExitSell(params: {
  account: PlatformAccount;
  buyOrderId: string;
  tokenId: string;
  shares: number;
}): Promise<PolymarketAutoExitSellResult> {
  const buyOrderId = String(params.buyOrderId ?? "").trim();
  const tokenId = String(params.tokenId ?? "").trim();
  const shares = Number(params.shares);
  if (!buyOrderId)
    return { ok: false, buyOrderId: "", error: "缺少 buyOrderId" };
  if (!tokenId)
    return { ok: false, buyOrderId, error: "缺少 tokenId" };
  if (!Number.isFinite(shares) || shares <= 0)
    return { ok: false, buyOrderId, error: `无效卖出份数: ${params.shares}` };

  if (scheduledBuyOrderIds.has(buyOrderId))
    return { ok: false, buyOrderId, error: "该买单已挂过止盈卖单" };
  scheduledBuyOrderIds.add(buyOrderId);

  try {
    const config = parseTokenConfig(params.account.token);
    const creds = resolveApiCreds(config);
    const privateKey = resolvePrivateKey(config);
    if (!creds.address)
      throw new Error("凭证缺少 walletAddress");
    if (!privateKey)
      throw new Error("缺少有效私钥");
    if (!creds.apiKey || !creds.secret || !creds.passphrase)
      throw new Error("凭证缺少用户 API Key");

    const gateway = params.account.gateway || POLYMARKET_CLOB_API;

    // 刷新后内存幂等丢失：先查该 token 是否已有 open SELL
    const existing = await findExistingPolymarketOpenSell({
      account: params.account,
      tokenId,
      gateway,
      address: creds.address,
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
    });
    if (existing) {
      return {
        ok: true,
        buyOrderId,
        sellOrderId: existing.orderId,
        price: existing.price,
        shares,
        skippedDuplicate: true,
        status: "live",
      };
    }

    const orderOptions = await fetchSellOrderOptions(gateway, tokenId);
    if (orderOptions.minOrderSize > 0 && shares + 1e-12 < orderOptions.minOrderSize) {
      throw new Error(
        `卖出份数 ${shares} 低于 min_order_size ${orderOptions.minOrderSize}`,
      );
    }

    // GTC 挂单依赖 heartbeat；先启动再下单，避免 ~10s 被官方清掉
    ensurePolymarketHeartbeat(params.account);

    const price = pickPolymarketAutoExitSellPrice(orderOptions.tickSize);
    const orderBody = await createPolymarketGtcSellOrderBody(
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

    if (!result?.success) {
      const msg = String(result?.errorMsg ?? "GTC 卖单未受理").trim();
      throw new Error(msg);
    }

    const sellOrderId = String(result.orderID ?? "").trim();
    return {
      ok: true,
      buyOrderId,
      sellOrderId: sellOrderId || undefined,
      price,
      shares,
      tickSize: orderOptions.tickSize,
      status: String(result.status ?? ""),
    };
  }
  catch (err) {
    // 允许失败后人工/下次再试：从集合移除
    scheduledBuyOrderIds.delete(buyOrderId);
    return {
      ok: false,
      buyOrderId,
      shares,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 从买单 POST 响应解析份数并挂止盈卖单（失败只打日志，不影响买单结果）。
 * 仅应在「已确认成交」路径调用（FOK matched+takingAmount，或 trades 确认后）。
 * delayed 受理阶段禁止调用。
 */
export function schedulePolymarketAutoExitSellAfterBuy(params: {
  account: PlatformAccount;
  buyOrderId: string;
  tokenId: string;
  buyResponse: { makingAmount?: string | number; takingAmount?: string | number } | null | undefined;
  /** 扩展页开关；undefined/true = 开 */
  enabled?: boolean;
}): void {
  if (!isPolymarketAutoExitSellEnabled(params.enabled)) {
    console.info(
      `[Polymarket] auto-exit skip: 扩展「PM卖单」已关闭 buy=${params.buyOrderId}`,
    );
    return;
  }
  const fill = parsePolymarketBuyOrderFill(params.buyResponse);
  if (!(fill.shares > 0)) {
    console.warn(
      "[Polymarket] auto-exit skip: 买单尚未解析到确认成交份数，不挂卖单",
      params.buyOrderId,
    );
    return;
  }
  void placePolymarketAutoExitSell({
    account: params.account,
    buyOrderId: params.buyOrderId,
    tokenId: params.tokenId,
    shares: fill.shares,
  }).then((r) => {
    if (r.ok) {
      const dup = r.skippedDuplicate ? " (已有 open SELL，跳过)" : "";
      console.info(
        `[Polymarket] auto-exit GTC SELL @ ${r.price} shares=${r.shares} tick=${r.tickSize} sellOrder=${r.sellOrderId} buy=${r.buyOrderId}${dup}`,
      );
      return;
    }
    console.warn(`[Polymarket] auto-exit failed buy=${r.buyOrderId}: ${r.error}`);
  }).catch((err) => {
    console.warn("[Polymarket] auto-exit unexpected error", err);
  });
}

/** 测试用：清空幂等集合 */
export function clearPolymarketAutoExitSellScheduleForTests(): void {
  scheduledBuyOrderIds.clear();
}
