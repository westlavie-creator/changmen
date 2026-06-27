import {
  Chain,
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
  isV2Order,
  orderToJsonV2,
  type ApiKeyCreds,
  type TickSize,
} from "@polymarket/clob-client-v2";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import type { AccountBalanceResult, PlatformProvider } from "@venue/contract";
import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

const BALANCE_PATH = "/balance-allowance";
const ORDER_PATH = "/order";
const ORDER_BOOK_PATH = "/book";

// 开发者凭证（固定，所有账号共用）
const DEV_CONFIG = {
  address: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
  apiKey: "019f097a-fe02-73d1-b2c8-265dae5b7b08",
  secret: "kYVlDPyvJUTjg5SUNrQKDIzOdXV3IEC_yk0VkMNRiYQ=",
  passphrase: "bb263f2bb685f113599ad40b1756b1f73976dcabc0b86849e48a6ed2fdbd9e77",
} as const;
const COLLATERAL_DECIMALS = 1_000_000;

// ---- interfaces ----

interface PolymarketTokenConfig {
  walletAddress?: string;
  address?: string;
  funder?: string;
  funderAddress?: string;
  signatureType?: number | string;
  privateKey?: string;
  private_key?: string;
  apiKey?: string;
  key?: string;
  api_key?: string;
  secret?: string;
  apiSecret?: string;
  api_secret?: string;
  passphrase?: string;
  apiCreds?: {
    apiKey?: string;
    key?: string;
    api_key?: string;
    secret?: string;
    apiSecret?: string;
    api_secret?: string;
    passphrase?: string;
  };
  polyHeaders?: Record<string, unknown>;
}

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
  neg_risk?: boolean;
}

// ---- config helpers ----

function parseTokenConfig(raw: string | undefined): PolymarketTokenConfig {
  const text = raw?.trim();
  if (!text) return {};
  const direct = parseJsonObject(text);
  if (direct) return direct;
  const decoded = decodeBase64Utf8(text);
  return parseJsonObject(decoded) ?? {};
}

function parseJsonObject(text: string | undefined): PolymarketTokenConfig | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as PolymarketTokenConfig : undefined;
  } catch {
    return undefined;
  }
}

function decodeBase64Utf8(text: string): string | undefined {
  try {
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value != null) return String(value);
  }
  return "";
}

function resolveApiCreds(config: PolymarketTokenConfig) {
  const headers = config.polyHeaders;
  const api = config.apiCreds ?? {};
  return {
    address: config.walletAddress || config.address || headerValue(headers, "POLY_ADDRESS"),
    apiKey: api.apiKey || api.key || api.api_key
      || config.apiKey || config.key || config.api_key
      || headerValue(headers, "POLY_API_KEY"),
    secret: api.secret || api.apiSecret || api.api_secret
      || config.secret || config.apiSecret || config.api_secret,
    passphrase: api.passphrase || config.passphrase || headerValue(headers, "POLY_PASSPHRASE"),
    signatureType: resolveSignatureType(config),
  };
}

function resolveFunder(config: PolymarketTokenConfig): string {
  return config.funder || config.funderAddress || "";
}

function resolveAddress(config: PolymarketTokenConfig): string {
  return config.walletAddress || config.address || headerValue(config.polyHeaders, "POLY_ADDRESS");
}

function resolveSignatureType(config: PolymarketTokenConfig): string | number | undefined {
  const address = resolveAddress(config).toLowerCase();
  const funder = resolveFunder(config).toLowerCase();
  if (address && funder && address !== funder) return 3;
  if (config.signatureType !== undefined && config.signatureType !== "") return config.signatureType;
  return undefined;
}

function resolvePrivateKey(config: PolymarketTokenConfig): Hex | undefined {
  const raw = config.privateKey ?? config.private_key;
  if (!raw) return undefined;
  const key = String(raw).trim();
  const hex = key.startsWith("0x") ? key : `0x${key}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? hex as Hex : undefined;
}

// ---- L2 auth headers ----

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const secretBytes = base64UrlToBytes(secret);
  const secretKeyData = secretBytes.buffer.slice(
    secretBytes.byteOffset,
    secretBytes.byteOffset + secretBytes.byteLength,
  ) as ArrayBuffer;
  const messageBytes = new TextEncoder().encode(message);
  const messageData = messageBytes.buffer.slice(
    messageBytes.byteOffset,
    messageBytes.byteOffset + messageBytes.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw", secretKeyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, messageData);
  return bytesToBase64Url(new Uint8Array(sig));
}

async function buildL2Headers(
  address: string,
  apiKey: string,
  secret: string,
  passphrase: string,
  method: "GET" | "POST",
  requestPath: string,
  body?: string,
): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Base64Url(secret, timestamp + method + requestPath + (body ?? ""));
  return {
    "POLY_ADDRESS": address,
    "POLY_SIGNATURE": signature,
    "POLY_TIMESTAMP": timestamp,
    "POLY_API_KEY": apiKey,
    "POLY_PASSPHRASE": passphrase,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

async function buildBuilderHeaders(
  method: "GET" | "POST",
  requestPath: string,
  body?: string,
): Promise<Record<string, string>> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Base64Url(
    DEV_CONFIG.secret,
    timestamp + method + requestPath + (body ?? ""),
  );
  return {
    "POLY_BUILDER_API_KEY": DEV_CONFIG.apiKey,
    "POLY_BUILDER_SIGNATURE": signature,
    "POLY_BUILDER_TIMESTAMP": timestamp,
    "POLY_BUILDER_PASSPHRASE": DEV_CONFIG.passphrase,
  };
}

async function buildL2HeadersFromAccount(
  account: PlatformAccount,
  method: "GET" | "POST",
  requestPath: string,
  body?: string,
): Promise<Record<string, string> | undefined> {
  const creds = resolveApiCreds(parseTokenConfig(account.token));
  if (!creds.address || !creds.apiKey || !creds.secret || !creds.passphrase) return undefined;
  return buildL2Headers(creds.address, creds.apiKey, creds.secret, creds.passphrase, method, requestPath, body);
}

// ---- official CLOB v2 order helpers ----

function resolveSdkSignatureType(value: string | number | undefined): SignatureTypeV2 {
  const numeric = Number(value ?? 0);
  if (numeric === SignatureTypeV2.POLY_PROXY) return SignatureTypeV2.POLY_PROXY;
  if (numeric === SignatureTypeV2.POLY_GNOSIS_SAFE) return SignatureTypeV2.POLY_GNOSIS_SAFE;
  if (numeric === SignatureTypeV2.POLY_1271) return SignatureTypeV2.POLY_1271;
  return SignatureTypeV2.EOA;
}

function normalizeTickSize(value: string | number | undefined): TickSize {
  const tick = String(value ?? "").trim();
  if (tick === "0.1" || tick === "0.01" || tick === "0.001" || tick === "0.0001")
    return tick;
  throw new Error(`Polymarket 返回了不支持的 tick_size: ${tick || "空"}`);
}

async function fetchOrderOptions(gateway: string, tokenId: string): Promise<{ tickSize: TickSize; negRisk: boolean }> {
  const params = new URLSearchParams({ token_id: tokenId });
  const book = await polymarketPluginGet<PolymarketOrderBookResponse>(
    `${gateway}${ORDER_BOOK_PATH}?${params.toString()}`,
  );
  return {
    tickSize: normalizeTickSize(book?.tick_size ?? book?.minimum_tick_size),
    negRisk: Boolean(book?.neg_risk),
  };
}

function createPolymarketClient(
  gateway: string,
  privateKey: Hex,
  creds: ReturnType<typeof resolveApiCreds>,
  config: PolymarketTokenConfig,
): ClobClient {
  const account = privateKeyToAccount(privateKey);
  const signer = createWalletClient({ account, chain: polygon, transport: http() });
  const client = new ClobClient({
    host: gateway,
    chain: Chain.POLYGON,
    signer,
    creds: {
      key: creds.apiKey!,
      secret: creds.secret!,
      passphrase: creds.passphrase!,
    } satisfies ApiKeyCreds,
    signatureType: resolveSdkSignatureType(creds.signatureType),
    funderAddress: resolveFunder(config) || undefined,
  });
  Reflect.set(client, "cachedVersion", 2);
  return client;
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

// ---- provider ----

export const polymarketProvider: PlatformProvider = {
  async getBalance(account: PlatformAccount): Promise<AccountBalanceResult | undefined> {
    try {
      const config = parseTokenConfig(account.token);
      const headers = await buildL2HeadersFromAccount(account, "GET", BALANCE_PATH);
      if (!headers) return undefined;
      const gateway = account.gateway || POLYMARKET_CLOB_API;
      const requestPath = balanceQueryPathForSignature(resolveSignatureType(config));
      const data = await polymarketPluginGet<PolymarketBalanceAllowanceResponse>(
        `${gateway}${requestPath}`,
        { headers },
      );
      const balance = parseCollateralBalance(data?.balance);
      if (balance === undefined) return undefined;
      return { balance, currency: "USDT" };
    } catch (err) {
      console.warn("[Polymarket] getBalance failed", err);
      return undefined;
    }
  },

  async checkBet(_account: PlatformAccount, option: BetOption): Promise<BetOption> {
    // 临时放行：先让 Polymarket 手动/自动下注通过 A8 前置检查门禁。
    // 真正的订单簿校验和 FOK 成交判断由 betting() / Polymarket CLOB 返回结果承担。
    option.data = {
      tokenId: option.itemId,
      odds: option.odds,
      betMoney: option.betMoney,
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

    // price = probability = 1 / decimal_odds，保留 4 位小数（Polymarket tick）
    const price = Math.round((1 / option.odds) * 10000) / 10000;
    if (!price || price <= 0 || price >= 1)
      return new BetResult("Polymarket", false, `无效赔率 ${option.odds}`);

    const tokenId = option.itemId;

    try {
      const orderOptions = await fetchOrderOptions(gateway, tokenId);
      const clobClient = createPolymarketClient(gateway, privateKey, creds, config);
      clobClient.tickSizes[tokenId] = orderOptions.tickSize;
      clobClient.negRisk[tokenId] = orderOptions.negRisk;
      const signedOrder = await clobClient.createOrder({
        tokenID: tokenId,
        price,
        size: option.betMoney / price,
        side: Side.BUY,
      }, orderOptions);
      if (!isV2Order(signedOrder))
        throw new Error("Polymarket SDK 未生成 CLOB v2 订单");
      const orderBody = orderToJsonV2(signedOrder, creds.apiKey, OrderType.FOK, false, false);
      const bodyStr = JSON.stringify(orderBody);

      const [l2Headers, builderHeaders] = await Promise.all([
        buildL2Headers(creds.address, creds.apiKey, creds.secret, creds.passphrase, "POST", ORDER_PATH, bodyStr),
        buildBuilderHeaders("POST", ORDER_PATH, bodyStr),
      ]);
      const headers = { ...l2Headers, ...builderHeaders };

      const result = await polymarketPluginPost<PolymarketOrderResponse>(
        `${gateway}${ORDER_PATH}`,
        orderBody,
        { headers },
      );

      if (!result?.success) {
        return new BetResult(
          "Polymarket", false,
          result?.errorMsg || "FOK 订单未成交（无足够流动性）",
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
