/** Polymarket Gamma/CLOB REST — 扩展 background 代发（绕过页面 CORS，对齐 A8 Zn） */

import { a8PluginGet, a8PluginPost, hasA8PluginRuntime } from "@/chrome-plugin/bridge";

export const POLYMARKET_PLUGIN_REQUIRED_MSG =
  "Polymarket 采集需要 Gamebet 扩展（对齐 A8 Zn）：加载 changmen/client/chrome-extension，或使用 Electron 启动（内嵌扩展）";

const PLUGIN_TIMEOUT_MS = 60_000;

function unwrapPluginResponse<T>(raw: unknown): T {
  if (raw instanceof Error)
    throw raw;
  if (raw && typeof raw === "object" && "message" in raw && !("status" in raw) && !("data" in raw)) {
    const message = String((raw as { message?: unknown }).message || "Polymarket API 请求失败");
    throw new Error(message);
  }
  if (raw && typeof raw === "object" && "status" in raw && "data" in raw) {
    const res = raw as { status: number; data: unknown };
    if (res.status >= 400) {
      const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
      throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
    }
    return res.data as T;
  }
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data?: unknown }).data as T;
  }
  return raw as T;
}

function requirePluginRuntime(): void {
  if (!hasA8PluginRuntime())
    throw new Error(POLYMARKET_PLUGIN_REQUIRED_MSG);
}

/** 扩展 background axios GET（不经 tab，与 Dex `dexPluginGet` 同路） */
export async function polymarketPluginGet<T>(
  url: string,
  options?: { headers?: Record<string, string>; timeout?: number; withCredentials?: boolean },
): Promise<T> {
  requirePluginRuntime();
  const raw = await a8PluginGet(url, { timeout: PLUGIN_TIMEOUT_MS, withCredentials: false, ...options });
  if (raw == null)
    throw new Error("Polymarket API 无响应");
  return unwrapPluginResponse<T>(raw);
}

/** 扩展 background axios POST（CLOB /prices /order 等接口） */
export async function polymarketPluginPost<T>(
  url: string,
  data: unknown,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  requirePluginRuntime();
  const raw = await a8PluginPost(url, data, { timeout: PLUGIN_TIMEOUT_MS, withCredentials: false, ...options });
  if (raw == null)
    throw new Error("Polymarket API 无响应");
  return unwrapPluginResponse<T>(raw);
}
