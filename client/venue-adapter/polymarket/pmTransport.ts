/**
 * Polymarket HTTP 统一出口：按 pmTransportMode 分流 official / VPS / 插件。
 * 业务代码只依赖 transport.ts / pmClientApi.ts，不感知 mode。
 */
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { a8PluginGet, a8PluginPost } from "@changmen/client-core/chrome-plugin/bridge";
import { directGet, directPostJson } from "@changmen/client-core/shared/http";
import {
  changmenPmEsportCall,
  changmenPmHttpRequest,
  parseJsonLoose,
} from "@changmen/client-core/shared/platformHttp";
import { POLYMARKET_CLOB_API } from "./api";
import { buildL2HeadersFromAccount } from "./l2Auth";
import { resolvePmHttpMode } from "./pmTransportMode";

const POLY_HEADER_NAMES = [
  "POLY_ADDRESS",
  "POLY_SIGNATURE",
  "POLY_TIMESTAMP",
  "POLY_API_KEY",
  "POLY_PASSPHRASE",
] as const;

export interface PmTransportHttpOptions {
  headers?: Record<string, string>;
  account?: PlatformAccount;
  l2Path?: string;
}

function pickPolyHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers)
    return undefined;
  const out: Record<string, string> = {};
  for (const name of POLY_HEADER_NAMES) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value != null && String(value).trim())
      out[name] = String(value);
  }
  return Object.keys(out).length ? out : undefined;
}

function unwrapJsonBody<T>(text: string): T {
  const trimmed = text.trim();
  if (!trimmed)
    throw new Error("Polymarket API 无响应");
  if (trimmed.startsWith("{") || trimmed.startsWith("["))
    return parseJsonLoose(trimmed) as T;
  return trimmed as T;
}

async function resolveAuthHeaders(
  method: "GET" | "POST",
  l2Path: string | undefined,
  account: PlatformAccount | undefined,
  polyFromOptions: Record<string, string> | undefined,
  bodyText = "",
): Promise<Record<string, string>> {
  if (polyFromOptions)
    return { ...polyFromOptions };
  if (account && l2Path) {
    const built = await buildL2HeadersFromAccount(account, method, l2Path, bodyText);
    if (built)
      return built;
  }
  return {};
}

async function pmHttpViaDirect<T>(
  method: "GET" | "POST",
  url: string,
  data: unknown | undefined,
  options?: PmTransportHttpOptions,
): Promise<T> {
  const l2Path = options?.l2Path;
  const bodyText = method === "POST" && data !== undefined ? JSON.stringify(data) : "";
  const headers = await resolveAuthHeaders(
    method,
    l2Path,
    options?.account,
    pickPolyHeaders(options?.headers),
    bodyText,
  );
  if (method === "GET")
    return directGet<T>(url, headers);
  return directPostJson<T>(url, headers, data);
}

async function pmHttpViaExtension<T>(
  method: "GET" | "POST",
  url: string,
  data: unknown | undefined,
  options?: PmTransportHttpOptions,
): Promise<T> {
  const l2Path = options?.l2Path;
  const bodyText = method === "POST" && data !== undefined ? JSON.stringify(data) : "";
  const headers = await resolveAuthHeaders(
    method,
    l2Path,
    options?.account,
    pickPolyHeaders(options?.headers),
    bodyText,
  );
  const reqOptions = Object.keys(headers).length ? { headers } : undefined;
  const raw = method === "GET"
    ? await a8PluginGet(url, reqOptions)
    : await a8PluginPost(url, data, reqOptions);
  return unwrapPluginResponse<T>(raw);
}

/** 对齐 PB transport：插件 background 返回 axios response（含 .data） */
function unwrapPluginResponse<T>(response: unknown): T {
  if (response instanceof Error)
    throw response;
  if (response && typeof response === "object") {
    const row = response as Record<string, unknown>;
    if (typeof row.message === "string" && row.response == null && row.status == null && !("data" in row))
      throw new Error(row.message);
    if ("data" in row && ("status" in row || "headers" in row || "statusText" in row))
      return row.data as T;
  }
  return response as T;
}

async function pmHttpViaVps<T>(
  method: "GET" | "POST",
  url: string,
  data: unknown | undefined,
  options?: PmTransportHttpOptions,
): Promise<T> {
  const polyHeaders = pickPolyHeaders(options?.headers);
  const res = await changmenPmHttpRequest({
    method,
    url,
    body: data,
    playerId: options?.account?.accountId && options?.l2Path
      ? Number(options.account.accountId)
      : undefined,
    l2Path: options?.l2Path,
    polyHeaders,
  });
  return unwrapJsonBody<T>(res.text);
}

function dispatchHttp<T>(
  method: "GET" | "POST",
  url: string,
  data: unknown | undefined,
  options?: PmTransportHttpOptions,
): Promise<T> {
  const mode = resolvePmHttpMode();
  if (mode === "direct")
    return pmHttpViaDirect<T>(method, url, data, options);
  if (mode === "extension")
    return pmHttpViaExtension<T>(method, url, data, options);
  return pmHttpViaVps<T>(method, url, data, options);
}

/** 原 polymarketPluginGet / polymarketPluginPost 底层 */
export async function pmTransportHttpGet<T>(
  url: string,
  options?: PmTransportHttpOptions,
): Promise<T> {
  return dispatchHttp<T>("GET", url, undefined, options);
}

export async function pmTransportHttpPost<T>(
  url: string,
  data: unknown,
  options?: PmTransportHttpOptions,
): Promise<T> {
  return dispatchHttp<T>("POST", url, data, options);
}

const ORDER_PATH = "/order";
const TRADES_PATH = "/data/trades";
const ORDER_PATH_PREFIX = "/data/order/";
const HEARTBEAT_PATH = "/v1/heartbeats";
const OPEN_ORDERS_PATH = "/data/orders";
const NO_MORE_CURSOR = "LTE=";

type LocalHttpMode = "direct" | "extension";

function stripEsportBodyForVps(body: Record<string, unknown>): Record<string, unknown> {
  const { _account, ...rest } = body;
  void _account;
  return rest;
}

function requireEsportAccount(body: Record<string, unknown>): PlatformAccount {
  const account = body._account as PlatformAccount | undefined;
  if (!account?.token)
    throw new Error("Polymarket 语义 API 需要账号 token（extension/direct 模式）");
  return account;
}

function clobGatewayFromAccount(account: PlatformAccount): string {
  return String(account.gateway || POLYMARKET_CLOB_API).replace(/\/+$/, "");
}

function parseEsportOrderField(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null || raw === "")
    return undefined;
  if (typeof raw === "object" && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  const text = String(raw).trim();
  if (!text)
    return undefined;
  if (text.startsWith("{") || text.startsWith("["))
    return parseJsonLoose(text) as Record<string, unknown>;
  return undefined;
}

function extractHeartbeatId(raw: unknown): string {
  if (!raw || typeof raw !== "object")
    return "";
  const row = raw as Record<string, unknown>;
  const id = row.heartbeat_id ?? row.heartbeatId;
  return id == null ? "" : String(id);
}

function extractHeartbeatIdFromError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const rawText = err && typeof err === "object" && "rawText" in err
    ? String((err as { rawText?: unknown }).rawText ?? "")
    : "";
  for (const source of [rawText, msg]) {
    if (!source)
      continue;
    const text = String(source);
    const jsonStart = text.indexOf("{");
    if (jsonStart >= 0) {
      try {
        const id = extractHeartbeatId(parseJsonLoose(text.slice(jsonStart)));
        if (id)
          return id;
      }
      catch { /* ignore */ }
    }
  }
  const m = msg.match(/heartbeat_id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i);
  return m?.[1] ?? "";
}

async function localHttpGet<T>(
  mode: LocalHttpMode,
  url: string,
  options?: PmTransportHttpOptions,
): Promise<T> {
  if (mode === "direct")
    return pmHttpViaDirect<T>("GET", url, undefined, options);
  return pmHttpViaExtension<T>("GET", url, undefined, options);
}

async function localHttpPost<T>(
  mode: LocalHttpMode,
  url: string,
  data: unknown,
  options?: PmTransportHttpOptions,
): Promise<T> {
  if (mode === "direct")
    return pmHttpViaDirect<T>("POST", url, data, options);
  return pmHttpViaExtension<T>("POST", url, data, options);
}

async function fetchPolymarketTradesSinceLocal(
  mode: LocalHttpMode,
  account: PlatformAccount,
  gateway: string,
  afterSec: number,
  maxPages: number,
): Promise<unknown[]> {
  const host = String(gateway || POLYMARKET_CLOB_API).replace(/\/+$/, "");
  const all: unknown[] = [];
  let nextCursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ after: String(Math.floor(afterSec)) });
    if (nextCursor)
      params.set("next_cursor", nextCursor);
    const url = `${host}${TRADES_PATH}?${params.toString()}`;
    const data = await localHttpGet<{ data?: unknown[]; next_cursor?: string }>(
      mode,
      url,
      { account, l2Path: TRADES_PATH },
    );
    const batch = Array.isArray(data?.data) ? data.data : [];
    all.push(...batch);
    nextCursor = data?.next_cursor;
    if (!nextCursor || nextCursor === NO_MORE_CURSOR || batch.length === 0)
      break;
  }
  return all;
}

async function pmEsportCallLocal<T>(
  mode: LocalHttpMode,
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  switch (action) {
    case "Pm_GetBook": {
      const tokenId = String(body.tokenId ?? "").trim();
      if (!tokenId)
        throw new Error("tokenId 必填");
      const gateway = String(body.gateway || POLYMARKET_CLOB_API).replace(/\/+$/, "");
      const params = new URLSearchParams({ token_id: tokenId });
      return localHttpGet<T>(mode, `${gateway}/book?${params.toString()}`);
    }
    case "Pm_SubmitOrder": {
      const account = requireEsportAccount(body);
      const order = parseEsportOrderField(body.order);
      if (!order)
        throw new Error("order 必填");
      const gateway = clobGatewayFromAccount(account);
      return localHttpPost<T>(mode, `${gateway}${ORDER_PATH}`, order, {
        account,
        l2Path: ORDER_PATH,
      });
    }
    case "Pm_GetTrades": {
      const account = requireEsportAccount(body);
      const afterSec = Number(body.after);
      if (!Number.isFinite(afterSec) || afterSec <= 0)
        throw new Error("after 必填（unix 秒）");
      const maxPages = Math.min(Math.max(Number(body.maxPages) || 30, 1), 30);
      return fetchPolymarketTradesSinceLocal(
        mode,
        account,
        clobGatewayFromAccount(account),
        Math.floor(afterSec),
        maxPages,
      ) as Promise<T>;
    }
    case "Pm_GetOrder": {
      const account = requireEsportAccount(body);
      const orderId = String(body.orderId ?? "").trim();
      if (!orderId)
        throw new Error("orderId 必填");
      const gateway = clobGatewayFromAccount(account);
      const path = `${ORDER_PATH_PREFIX}${orderId}`;
      return localHttpGet<T>(mode, `${gateway}${path}`, { account, l2Path: path });
    }
    case "Pm_Heartbeat": {
      const account = requireEsportAccount(body);
      const gateway = clobGatewayFromAccount(account);
      let heartbeatId = String(body.heartbeatId ?? body.heartbeat_id ?? "").trim();

      async function postOnce(id: string) {
        const payload = { heartbeat_id: id };
        return localHttpPost<Record<string, unknown>>(
          mode,
          `${gateway}${HEARTBEAT_PATH}`,
          payload,
          { account, l2Path: HEARTBEAT_PATH },
        );
      }

      try {
        const res = await postOnce(heartbeatId);
        const nextId = extractHeartbeatId(res) || heartbeatId;
        return { heartbeat_id: nextId } as T;
      }
      catch (err) {
        const recovered = extractHeartbeatIdFromError(err);
        if (!recovered)
          throw err;
        const res = await postOnce(recovered);
        const nextId = extractHeartbeatId(res) || recovered;
        return { heartbeat_id: nextId } as T;
      }
    }
    case "Pm_GetOpenOrders": {
      const account = requireEsportAccount(body);
      const gateway = clobGatewayFromAccount(account);
      const assetId = String(body.assetId ?? body.tokenId ?? "").trim();
      const qs = new URLSearchParams();
      if (assetId)
        qs.set("asset_id", assetId);
      const l2Path = qs.toString() ? `${OPEN_ORDERS_PATH}?${qs.toString()}` : OPEN_ORDERS_PATH;
      return localHttpGet<T>(mode, `${gateway}${l2Path}`, { account, l2Path });
    }
    default:
      throw new Error(
        `[PmTransport] ${mode} 模式尚未实现 ${action}，请设 PM_HTTP_MODE=vps 或补全 pmEsportCallLocal`,
      );
  }
}

async function pmEsportCallDirect<T>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  return pmEsportCallLocal<T>("direct", action, body);
}

async function pmEsportCallExtension<T>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  return pmEsportCallLocal<T>("extension", action, body);
}

/** pmClientApi 底层：按 mode 走 VPS 语义 API / 直连 / 插件 */
export async function pmEsportCall<T>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  const mode = resolvePmHttpMode();
  if (mode === "vps")
    return changmenPmEsportCall<T>(action, stripEsportBodyForVps(body));
  if (mode === "direct")
    return pmEsportCallDirect<T>(action, body);
  return pmEsportCallExtension<T>(action, body);
}
