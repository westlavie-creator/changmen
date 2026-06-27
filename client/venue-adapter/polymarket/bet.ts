import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import type { AccountBalanceResult, PlatformProvider } from "@venue/contract";
import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

const BALANCE_PATH = "/balance-allowance";
const ORDER_PATH = "/order";

// 开发者凭证（固定，所有账号共用）
const DEV_CONFIG = {
  address: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
  apiKey: "019f097a-fe02-73d1-b2c8-265dae5b7b08",
  secret: "kYVlDPyvJUTjg5SUNrQKDIzOdXV3IEC_yk0VkMNRiYQ=",
  passphrase: "bb263f2bb685f113599ad40b1756b1f73976dcabc0b86849e48a6ed2fdbd9e77",
} as const;
const COLLATERAL_DECIMALS = 1_000_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ---- EIP-712 pre-computed constants ----

function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = h.length % 2 ? "0" + h : h;
  const out = new Uint8Array(padded.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// 将地址或 uint 值 ABI 编码为 32 字节（左补零）
function pad32(value: bigint | string): Uint8Array {
  const hex = typeof value === "bigint"
    ? value.toString(16).padStart(64, "0")
    : (value.startsWith("0x") ? value.slice(2) : value).padStart(64, "0");
  return hexToBytes(hex.slice(-64));
}

const DOMAIN_TYPE_HASH = keccak256(utf8(
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
));
const ORDER_TYPE_HASH = keccak256(utf8(
  "Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)",
));
const DOMAIN_SEPARATOR = keccak256(concat(
  DOMAIN_TYPE_HASH,
  keccak256(utf8("Polymarket CTF Exchange")),
  keccak256(utf8("1")),
  pad32(BigInt(137)),
  pad32("0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"),
));

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
  passphrase?: string;
  apiCreds?: {
    apiKey?: string;
    key?: string;
    api_key?: string;
    secret?: string;
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
    secret: api.secret || config.secret,
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
  if (config.signatureType !== undefined && config.signatureType !== "") return config.signatureType;
  const address = resolveAddress(config).toLowerCase();
  const funder = resolveFunder(config).toLowerCase();
  if (address && funder && address !== funder) return 1;
  return undefined;
}

function resolvePrivateKey(config: PolymarketTokenConfig): string | undefined {
  const raw = config.privateKey ?? config.private_key;
  if (!raw) return undefined;
  const key = String(raw).trim();
  return key.startsWith("0x") ? key.slice(2) : key;
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

// ---- EIP-712 order signing ----

function signOrderWithKey(
  privateKeyHex: string,
  salt: number,
  makerAddress: string,
  signerAddress: string,
  tokenId: string,
  makerAmount: number,
  takerAmount: number,
  sigType: number,
): string {
  const orderHash = keccak256(concat(
    ORDER_TYPE_HASH,
    pad32(BigInt(salt)),
    pad32(makerAddress),
    pad32(signerAddress),
    pad32(ZERO_ADDRESS),
    pad32(BigInt(tokenId)),
    pad32(BigInt(makerAmount)),
    pad32(BigInt(takerAmount)),
    pad32(0n),              // expiration
    pad32(0n),              // nonce
    pad32(0n),              // feeRateBps
    pad32(0n),              // side = BUY
    pad32(BigInt(sigType)),
  ));

  const digest = keccak256(concat(
    new Uint8Array([0x19, 0x01]),
    DOMAIN_SEPARATOR,
    orderHash,
  ));

  const privKey = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(digest, privKey, { lowS: true });
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const v = (sig.recovery + 27).toString(16).padStart(2, "0");
  return "0x" + r + s + v;
}

// ---- balance helpers ----

function balancePathFor(account: PlatformAccount): string {
  const config = parseTokenConfig(account.token);
  const signatureType = resolveSignatureType(config);
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
      const requestPath = balancePathFor(account);
      const headers = await buildL2HeadersFromAccount(account, "GET", BALANCE_PATH);
      if (!headers) return undefined;
      const gateway = account.gateway || POLYMARKET_CLOB_API;
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
    return option;
  },

  async betting(account: PlatformAccount, option: BetOption): Promise<BetResult> {
    const beginTime = Date.now();
    const config = parseTokenConfig(account.token);
    const creds = resolveApiCreds(config);
    const privateKeyHex = resolvePrivateKey(config);

    if (!creds.address)
      return new BetResult("Polymarket", false, "凭证缺少 walletAddress");
    if (!privateKeyHex)
      return new BetResult("Polymarket", false, "缺少私钥（在 token 中加 privateKey 字段，从 Polymarket 设置导出）");
    if (!creds.apiKey || !creds.secret || !creds.passphrase)
      return new BetResult("Polymarket", false, "凭证缺少用户 API Key（apiKey/secret/passphrase），请重新通过插件采集");

    const gateway = account.gateway || POLYMARKET_CLOB_API;

    const sigType = Number(creds.signatureType ?? 0);
    const makerAddress = sigType === 1 ? (resolveFunder(config) || creds.address) : creds.address;

    // price = probability = 1 / decimal_odds，保留 4 位小数（Polymarket tick）
    const price = Math.round((1 / option.odds) * 10000) / 10000;
    if (!price || price <= 0 || price >= 1)
      return new BetResult("Polymarket", false, `无效赔率 ${option.odds}`);

    // BUY: 付出 makerAmount USDC，收到 takerAmount outcome token
    const makerAmount = Math.round(option.betMoney * COLLATERAL_DECIMALS);
    const takerAmount = Math.floor(option.betMoney * COLLATERAL_DECIMALS / price);
    if (makerAmount <= 0 || takerAmount <= 0)
      return new BetResult("Polymarket", false, `下注金额 ${option.betMoney} 太小`);

    const salt = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const tokenId = option.itemId;

    try {
      const signature = signOrderWithKey(
        privateKeyHex, salt, makerAddress, creds.address, tokenId, makerAmount, takerAmount, sigType,
      );

      const orderBody = {
        order: {
          salt,
          maker: makerAddress,
          signer: creds.address,
          taker: ZERO_ADDRESS,
          tokenId,
          makerAmount: String(makerAmount),
          takerAmount: String(takerAmount),
          side: "BUY",
          expiration: "0",
          nonce: "0",
          feeRateBps: "0",
          signatureType: sigType,
          signature,
        },
        owner: creds.apiKey,
        orderType: "FOK",
        deferExec: false,
      };
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
