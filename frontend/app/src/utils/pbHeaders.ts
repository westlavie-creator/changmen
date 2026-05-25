import type { PlatformAccount } from "@/models/platformAccount";

function detectPbSessionSuffix(appData: Record<string, string>, outer: Record<string, string>) {
  for (const key of Object.keys(appData)) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m) return m[1];
  }
  for (const key of Object.keys(appData)) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return m[1];
  }
  for (const key of Object.keys(outer)) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return m[1];
  }
  return "515";
}

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

/** 对齐 A8 bundle P0() / backend pb_session.buildAuthHeaders */
export function buildPbAuthHeaders(
  account: PlatformAccount,
  extra: Record<string, string> = {},
): Record<string, string> | undefined {
  if (!account.token) return undefined;
  try {
    const outer = JSON.parse(account.token) as Record<string, string>;
    const appData = JSON.parse(outer["x-app-data"] || "{}") as Record<string, string>;
    const suffix = detectPbSessionSuffix(appData, outer);
    const browserSessionKey = `BrowserSessionId_${suffix}`;
    const custidAppKey = `custid_${suffix}`;
    const custidOuterKey = `custid_${suffix}`;
    const custidRaw =
      appData[custidAppKey] || outer[custidOuterKey] || outer.custid_515 || "";
    const headers: Record<string, string> = {
      "x-app-data": `${Object.keys(appData)
        .map((k) => `${k}=${appData[k]}`)
        .join(";")};`,
      [`x-browser-session-id-${suffix}`]: appData[browserSessionKey] || "",
      [`x-custid-${suffix}`]: decodeURIComponent(String(custidRaw).replace(/\+/g, "%20")),
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
