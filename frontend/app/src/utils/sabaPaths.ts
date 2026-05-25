import type { PlatformAccount } from "@/models/platformAccount";

/** 对齐 A8 qf(t, e) */
export function sabaAccountUrl(account: PlatformAccount, path: string): string {
  const base = (account.gateway || "").replace(/\/$/, "");
  const token = account.token || "";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}/${token}${suffix}`;
}

export function sabaFormHeaders(): Record<string, string> {
  return {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
}

/** 采集为 oddsid:Home；A8 bundle 正则 es_123:Home，两者均支持 */
export function parseSabaItemId(itemId: string): { oddsId: number; side: "h" | "a" } | null {
  const m = /^(?:es_)?([0-9]+):(Home|Away)$/i.exec(itemId);
  if (!m) return null;
  return {
    oddsId: Number(m[1]),
    side: m[2]!.toLowerCase() === "home" ? "h" : "a",
  };
}
