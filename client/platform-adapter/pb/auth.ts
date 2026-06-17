import type { PlatformAccount } from "@/models/platformAccount";

/** [A8 可证实] bundle `k0(t,e)`：固定 515 session 后缀，合并 extra 头 */
export function buildPbAuthHeaders(
  account: PlatformAccount,
  extra: Record<string, string> = {},
): Record<string, string> | undefined {
  if (account.token == null) return undefined;
  try {
    const outer = JSON.parse(account.token) as Record<string, string>;
    const appData = JSON.parse(outer["x-app-data"] || "{}") as Record<string, string>;
    const headers: Record<string, string> = {
      "x-app-data": `${Object.keys(appData)
        .map((k) => `${k}=${appData[k]}`)
        .join(";")};`,
      "x-browser-session-id-515": appData.BrowserSessionId_515 || "",
      "x-custid-515": decodeURIComponent(outer.custid_515 || "") || "",
      "v-hucode": outer["v-hucode"] || "",
      "x-requested-with": "XMLHttpRequest",
    };
    for (const key of Object.keys(extra)) {
      headers[key] = extra[key]!;
    }
    return headers;
  } catch {
    return undefined;
  }
}
