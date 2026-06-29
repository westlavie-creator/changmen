import { BuilderSigner } from "@polymarket/builder-signing-sdk";
import { loadPolymarketBuilderCreds } from "./relayer_config.js";
import { resolvePolymarketBuilderCode } from "./builder_code.js";

const CLOB_HOST = String(process.env.POLYMARKET_CLOB_API || "https://clob.polymarket.com").replace(/\/+$/, "");
const MICRO = 1_000_000;
const NO_MORE_CURSOR = "LTE=";

function requireBuilderSigner() {
  const creds = loadPolymarketBuilderCreds();
  if (!creds)
    throw new Error("未配置 POLY_BUILDER_API_KEY/SECRET/PASSPHRASE，无法查询 Builder 成交");
  return new BuilderSigner(creds);
}

function microToNumber(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n / MICRO : 0;
}

export function normalizeBuilderTrade(raw) {
  const matchSec = Number(raw?.matchTime);
  return {
    id: String(raw?.id ?? ""),
    tradeType: String(raw?.tradeType ?? ""),
    side: String(raw?.side ?? ""),
    status: String(raw?.status ?? ""),
    outcome: String(raw?.outcome ?? ""),
    price: Number(raw?.price) || 0,
    sizeShares: microToNumber(raw?.size),
    sizeUsdc: microToNumber(raw?.sizeUsdc),
    feeUsdc: microToNumber(raw?.feeUsdc),
    maker: String(raw?.maker ?? ""),
    owner: String(raw?.owner ?? ""),
    market: String(raw?.market ?? ""),
    assetId: String(raw?.assetId ?? ""),
    transactionHash: String(raw?.transactionHash ?? ""),
    matchTime: Number.isFinite(matchSec) ? matchSec * 1000 : null,
    matchTimeIso: Number.isFinite(matchSec) ? new Date(matchSec * 1000).toISOString() : null,
    builder: String(raw?.builder ?? ""),
  };
}

export function summarizeBuilderTrades(trades) {
  let volumeUsdc = 0;
  let feeUsdc = 0;
  let buyCount = 0;
  let sellCount = 0;
  for (const t of trades) {
    volumeUsdc += t.sizeUsdc;
    feeUsdc += t.feeUsdc;
    if (t.side === "BUY")
      buyCount += 1;
    else if (t.side === "SELL")
      sellCount += 1;
  }
  return {
    tradeCount: trades.length,
    volumeUsdc,
    feeUsdc,
    buyCount,
    sellCount,
  };
}

/**
 * @param {{ builderCode?: string, afterSec?: number, beforeSec?: number, market?: string, maxPages?: number, nextCursor?: string }} opts
 */
export async function fetchBuilderTradesPage(opts = {}) {
  const builderCode = opts.builderCode || resolvePolymarketBuilderCode();
  const params = new URLSearchParams({ builder_code: builderCode });
  if (opts.afterSec)
    params.set("after", String(Math.floor(opts.afterSec)));
  if (opts.beforeSec)
    params.set("before", String(Math.floor(opts.beforeSec)));
  if (opts.market)
    params.set("market", opts.market);
  if (opts.nextCursor)
    params.set("next_cursor", opts.nextCursor);

  const reqPath = `/builder/trades?${params.toString()}`;
  const signer = requireBuilderSigner();
  const headers = signer.createBuilderHeaderPayload("GET", reqPath);

  const res = await fetch(`${CLOB_HOST}${reqPath}`, {
    headers: { ...headers, Accept: "application/json" },
    signal: AbortSignal.timeout(Number(process.env.POLY_BUILDER_TRADES_TIMEOUT_MS || 30000)),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      detail = JSON.parse(text)?.error || detail;
    }
    catch { /* ignore */ }
    throw new Error(`Polymarket builder/trades ${res.status}: ${detail}`);
  }
  return JSON.parse(text);
}

/**
 * @param {{ afterSec?: number, beforeSec?: number, maxPages?: number }} opts
 */
export async function fetchAllBuilderTrades(opts = {}) {
  const maxPages = Math.min(Math.max(Number(opts.maxPages) || 5, 1), 20);
  const all = [];
  let nextCursor;
  let pages = 0;
  let lastResponse;

  while (pages < maxPages) {
    lastResponse = await fetchBuilderTradesPage({
      afterSec: opts.afterSec,
      beforeSec: opts.beforeSec,
      nextCursor,
    });
    const batch = Array.isArray(lastResponse?.data) ? lastResponse.data : [];
    all.push(...batch.map(normalizeBuilderTrade));
    pages += 1;
    nextCursor = lastResponse?.next_cursor;
    if (!nextCursor || nextCursor === NO_MORE_CURSOR || batch.length === 0)
      break;
  }

  return {
    trades: all,
    summary: summarizeBuilderTrades(all),
    pagesFetched: pages,
    nextCursor: lastResponse?.next_cursor ?? null,
    hasMore: Boolean(lastResponse?.next_cursor && lastResponse.next_cursor !== NO_MORE_CURSOR),
  };
}
