import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

function detectPbSessionSuffix(
  appData: Record<string, string>,
  outer: Record<string, string>,
): string {
  for (const key of Object.keys(appData)) {
    const m = key.match(/^BrowserSessionId_(\d+)$/);
    if (m) return m[1]!;
  }
  for (const key of Object.keys(appData)) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return m[1]!;
  }
  for (const key of Object.keys(outer)) {
    const m = key.match(/^custid_(\d+)$/);
    if (m) return m[1]!;
  }
  return "515";
}

function mergeInnerTokenHeaders(
  headers: Record<string, string>,
  outer: Record<string, string>,
): void {
  const innerRaw = outer.token;
  if (!innerRaw) return;
  try {
    const inner = JSON.parse(innerRaw) as Record<string, string>;
    for (const [key, value] of Object.entries(inner)) {
      if (value == null || value === "") continue;
      headers[key.toLowerCase()] = String(value);
    }
  } catch {
    /* optional nested auth headers */
  }
}

/** [A8 可证实] bundle `k0(t,e)`；[changmen 扩展] 515/1228 等后缀从 x-app-data 检测 + 合并 inner token 头 */
export function buildPbAuthHeaders(
  account: PlatformAccount,
  extra: Record<string, string> = {},
): Record<string, string> | undefined {
  if (account.token == null) return undefined;
  try {
    const outer = JSON.parse(account.token) as Record<string, string>;
    const appData = JSON.parse(outer["x-app-data"] || "{}") as Record<string, string>;
    const suffix = detectPbSessionSuffix(appData, outer);
    const browserSessionKey = `BrowserSessionId_${suffix}`;
    const custidAppKey = `custid_${suffix}`;
    const custidRaw =
      appData[custidAppKey] ||
      outer[`custid_${suffix}`] ||
      outer.custid_515 ||
      "";
    const headers: Record<string, string> = {
      "x-app-data": `${Object.keys(appData)
        .map((k) => `${k}=${appData[k]}`)
        .join(";")};`,
      [`x-browser-session-id-${suffix}`]: appData[browserSessionKey] || "",
      [`x-custid-${suffix}`]:
        decodeURIComponent(String(custidRaw).replace(/\+/g, "%20")) || "",
      "v-hucode": outer["v-hucode"] || "",
      "x-requested-with": "XMLHttpRequest",
    };
    mergeInnerTokenHeaders(headers, outer);
    for (const key of Object.keys(extra)) {
      headers[key] = extra[key]!;
    }
    return headers;
  } catch {
    return undefined;
  }
}
