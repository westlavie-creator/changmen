import type { AccountBalanceResult, PlatformProvider } from "@venue/contract";
import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet } from "./transport";

const BALANCE_PATH = "/balance-allowance";
const COLLATERAL_DECIMALS = 1_000_000;

interface PolymarketTokenConfig {
  walletAddress?: string;
  address?: string;
  funder?: string;
  funderAddress?: string;
  signatureType?: number | string;
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

function parseTokenConfig(raw: string | undefined): PolymarketTokenConfig {
  const text = raw?.trim();
  if (!text)
    return {};
  const direct = parseJsonObject(text);
  if (direct)
    return direct;
  const decoded = decodeBase64Utf8(text);
  return parseJsonObject(decoded) ?? {};
}

function parseJsonObject(text: string | undefined): PolymarketTokenConfig | undefined {
  if (!text)
    return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as PolymarketTokenConfig : undefined;
  }
  catch {
    return undefined;
  }
}

function decodeBase64Utf8(text: string): string | undefined {
  try {
    const binary = atob(text);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  catch {
    return undefined;
  }
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers)
    return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value != null)
      return String(value);
  }
  return "";
}

function resolveApiCreds(config: PolymarketTokenConfig) {
  const headers = config.polyHeaders;
  const api = config.apiCreds ?? {};
  return {
    address: config.walletAddress
      || config.address
      || headerValue(headers, "POLY_ADDRESS"),
    apiKey: api.apiKey
      || api.key
      || api.api_key
      || config.apiKey
      || config.key
      || config.api_key
      || headerValue(headers, "POLY_API_KEY"),
    secret: api.secret
      || config.secret,
    passphrase: api.passphrase
      || config.passphrase
      || headerValue(headers, "POLY_PASSPHRASE"),
    signatureType: resolveSignatureType(config),
  };
}

function resolveFunder(config: PolymarketTokenConfig): string {
  return config.funder
    || config.funderAddress
    || "";
}

function resolveAddress(config: PolymarketTokenConfig): string {
  return config.walletAddress
    || config.address
    || headerValue(config.polyHeaders, "POLY_ADDRESS");
}

function resolveSignatureType(config: PolymarketTokenConfig): string | number | undefined {
  if (config.signatureType !== undefined && config.signatureType !== "")
    return config.signatureType;
  const address = resolveAddress(config).toLowerCase();
  const funder = resolveFunder(config).toLowerCase();
  // Google/Magic 登录通常是 POLY_PROXY：signer address != proxy wallet/funder.
  if (address && funder && address !== funder)
    return 1;
  return undefined;
}

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
    "raw",
    secretKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, messageData);
  return bytesToBase64Url(new Uint8Array(sig));
}

async function buildL2Headers(
  account: PlatformAccount,
  method: "GET",
  requestPath: string,
): Promise<Record<string, string> | undefined> {
  const creds = resolveApiCreds(parseTokenConfig(account.token));
  if (!creds.address || !creds.apiKey || !creds.secret || !creds.passphrase)
    return undefined;

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmacSha256Base64Url(
    creds.secret,
    `${timestamp}${method}${requestPath}`,
  );

  return {
    "POLY_ADDRESS": creds.address,
    "POLY_SIGNATURE": signature,
    "POLY_TIMESTAMP": timestamp,
    "POLY_API_KEY": creds.apiKey,
    "POLY_PASSPHRASE": creds.passphrase,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

function balancePathFor(account: PlatformAccount): string {
  const config = parseTokenConfig(account.token);
  const signatureType = resolveSignatureType(config);
  const params = new URLSearchParams({ asset_type: "COLLATERAL" });
  if (signatureType !== undefined && signatureType !== "") {
    params.set("signature_type", String(signatureType));
  }
  return `${BALANCE_PATH}?${params.toString()}`;
}

function parseCollateralBalance(raw: string | number | undefined): number | undefined {
  if (raw === undefined || raw === null)
    return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value))
    return undefined;
  return value / COLLATERAL_DECIMALS;
}

export const polymarketProvider: PlatformProvider = {
  async getBalance(account: PlatformAccount): Promise<AccountBalanceResult | undefined> {
    try {
      const requestPath = balancePathFor(account);
      const headers = await buildL2Headers(account, "GET", BALANCE_PATH);
      if (!headers)
        return undefined;
      const gateway = account.gateway || POLYMARKET_CLOB_API;
      const data = await polymarketPluginGet<PolymarketBalanceAllowanceResponse>(
        `${gateway}${requestPath}`,
        { headers },
      );
      const balance = parseCollateralBalance(data?.balance);
      if (balance === undefined)
        return undefined;
      return { balance, currency: "USDT" };
    }
    catch (err) {
      console.warn("[Polymarket] getBalance failed", err);
      return undefined;
    }
  },

  async checkBet(_account: PlatformAccount, option: BetOption): Promise<BetOption> {
    return option;
  },

  async betting(): Promise<BetResult> {
    return new BetResult("Polymarket", false, "Polymarket 自动下单尚未实现");
  },
};
