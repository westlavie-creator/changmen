/**
 * Polymarket CLOB 余额（服务端直连，不经 http-relay）
 */
import {
  buildPolymarketL2HeadersFromToken,
  parsePolymarketTokenConfig,
} from "./clob_l2.js";

const DEFAULT_CLOB = "https://clob.polymarket.com";
const BALANCE_L2_PATH = "/balance-allowance";
const COLLATERAL_DECIMALS = 1_000_000;

function resolveSignatureType(config) {
  const value = config?.signatureType ?? config?.signature_type;
  if (value === undefined || value === null || String(value).trim() === "")
    return undefined;
  return String(value);
}

function balanceAllowanceUrl(gateway, signatureType) {
  const params = new URLSearchParams({ asset_type: "COLLATERAL" });
  if (signatureType !== undefined)
    params.set("signature_type", signatureType);
  const host = String(gateway || DEFAULT_CLOB).replace(/\/+$/, "");
  return `${host}${BALANCE_L2_PATH}?${params.toString()}`;
}

async function fetchClobServerTime(gateway) {
  try {
    const origin = new URL(gateway || DEFAULT_CLOB).origin;
    const res = await fetch(`${origin}/time`, { signal: AbortSignal.timeout(8000) });
    const ts = Number(String(await res.text()).trim());
    return Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : undefined;
  }
  catch {
    return undefined;
  }
}

/** @returns {null | { balance: number, currency: 'USDT' }} */
export async function fetchPolymarketCollateralBalance(account) {
  const token = account?.token;
  if (!token)
    return null;

  const gateway = account.gateway || DEFAULT_CLOB;
  const config = parsePolymarketTokenConfig(token);
  const url = balanceAllowanceUrl(gateway, resolveSignatureType(config));
  const timestamp = await fetchClobServerTime(gateway);
  const headers = buildPolymarketL2HeadersFromToken(
    token,
    "GET",
    BALANCE_L2_PATH,
    "",
    timestamp,
  );
  if (!headers)
    return null;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 160) || `CLOB ${res.status}`);
  }

  const data = await res.json();
  const raw = Number(data?.balance);
  if (!Number.isFinite(raw))
    return null;
  return { balance: raw / COLLATERAL_DECIMALS, currency: "USDT" };
}
