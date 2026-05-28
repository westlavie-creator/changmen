import type { PlatformAccount } from "@/models/platformAccount";

function compactTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 对齐 A8 Wy() */
export function buildImAccountHeaders(account: PlatformAccount): Record<string, string> {
  const gateway = (account.gateway || "").replace(/\/$/, "");
  return {
    "Content-Type": "application/json; charset=UTF-8",
    Referer: `${gateway}/`,
    Origin: gateway,
    "x-requested-with": "XMLHttpRequest",
    msuv: "2.0",
    cbv: `203_50_bmv2_${compactTimestamp()}`,
  };
}

export function imAccountUrl(account: PlatformAccount, path: string): string {
  const base = (account.gateway || "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
