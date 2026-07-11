function devBackendHttpOrigin(): string {
  const isWin = typeof navigator !== "undefined"
    ? /win/i.test(navigator.platform || navigator.userAgent)
    : typeof process !== "undefined" && process.platform === "win32";
  return `http://127.0.0.1:${isWin ? 3560 : 3456}`;
}

function proxyOriginFromLocalStorage(): string {
  if (typeof localStorage === "undefined")
    return "";
  const raw = localStorage.getItem("PROXY")?.trim();
  if (!raw)
    return "";
  try {
    return new URL(raw).origin;
  }
  catch {
    return raw.replace(/\/+$/, "");
  }
}

function devBrowserSameOrigin(): string {
  if (typeof window === "undefined")
    return "";
  return window.location.origin;
}

/**
 * PM HK 出口 http-relay / ws-forward 的服务端根地址（https://host，无尾斜杠）。
 * 生产同源 → window.location.origin；
 * 本地 dev 浏览器 → 始终 window.location.origin（Vite 代理 /esport/http-relay 到 VITE_PM_HK_RELAY_ORIGIN）。
 */
export function resolvePmHkRelayHttpOrigin(): string {
  if (typeof window !== "undefined" && typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    const same = devBrowserSameOrigin();
    if (same)
      return same;
  }

  const fromStorage = proxyOriginFromLocalStorage();
  if (fromStorage)
    return fromStorage;

  const fromEnv = typeof import.meta !== "undefined"
    ? String(import.meta.env.VITE_PM_HK_RELAY_ORIGIN || "").trim().replace(/\/+$/, "")
    : "";
  if (fromEnv)
    return fromEnv;

  if (typeof window !== "undefined")
    return window.location.origin;

  return devBackendHttpOrigin();
}
