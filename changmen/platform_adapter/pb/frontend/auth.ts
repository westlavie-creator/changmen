import type { PlatformAccount } from "@/models/platformAccount";

function mergeInnerTokenHeaders(headers: Record<string, string>, outer: Record<string, string>) {
  const innerRaw = outer.token;
  if (!innerRaw) return;
  try {
    const inner = typeof innerRaw === "string" ? JSON.parse(innerRaw) : innerRaw;
    for (const [key, value] of Object.entries(inner as Record<string, unknown>)) {
      if (value == null || value === "") continue;
      headers[key.toLowerCase()] = String(value);
    }
  } catch {
    /* optional nested auth headers */
  }
}

/** 对齐 A8 bundle `k0`：固定 `515` 后缀（非动态 detect） */
export function buildPbAuthHeaders(
  account: PlatformAccount,
  extra: Record<string, string> = {},
): Record<string, string> | undefined {
  if (!account.token) return undefined;
  try {
    const outer = JSON.parse(account.token) as Record<string, string>;
    const appData = JSON.parse(outer["x-app-data"] || "{}") as Record<string, string>;
    const custidRaw = appData.custid_515 || outer.custid_515 || "";
    const headers: Record<string, string> = {
      "x-app-data": `${Object.keys(appData)
        .map((k) => `${k}=${appData[k]}`)
        .join(";")};`,
      "x-browser-session-id-515": appData.BrowserSessionId_515 || "",
      "x-custid-515": decodeURIComponent(String(custidRaw).replace(/\+/g, "%20")),
      "v-hucode": outer["v-hucode"] || "",
      "x-requested-with": "XMLHttpRequest",
      Accept: "application/json, text/plain, */*",
      ...extra,
    };
    mergeInnerTokenHeaders(headers, outer);
    if (account.userAgent) headers["User-Agent"] = account.userAgent;
    if (account.referer) headers.Referer = account.referer;
    return headers;
  } catch {
    return undefined;
  }
}
