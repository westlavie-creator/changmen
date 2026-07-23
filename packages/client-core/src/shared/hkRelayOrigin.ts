function devBackendHttpOrigin(): string {
  const isWin = typeof navigator !== "undefined"
    ? /win/i.test(navigator.platform || navigator.userAgent)
    : typeof process !== "undefined" && process.platform === "win32";
  return `http://127.0.0.1:${isWin ? 3560 : 3456}`;
}

function devBrowserSameOrigin(): string {
  if (typeof window === "undefined")
    return "";
  return window.location.origin;
}

function hkRelayOriginFromEnv(): string {
  if (typeof import.meta === "undefined")
    return "";
  const env = import.meta.env as Record<string, string | undefined>;
  return String(env.VITE_HK_RELAY_ORIGIN || env.VITE_PM_HK_RELAY_ORIGIN || "").trim().replace(/\/+$/, "");
}

/**
 * 场馆 HK 出海 relay 根地址（https://host，无尾斜杠）：http-relay / ws-forward。
 * 生产浏览器 → window.location.origin（与 localStorage PROXY 无关；PROXY 仅给操盘账号 proxyId）。
 * 本地 dev → window.location.origin（Vite 代理到 VITE_HK_RELAY_ORIGIN）。
 */
export function resolveHkRelayHttpOrigin(): string {
  if (typeof window !== "undefined" && typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    const same = devBrowserSameOrigin();
    if (same)
      return same;
  }

  if (typeof window !== "undefined")
    return window.location.origin;

  const fromEnv = hkRelayOriginFromEnv();
  if (fromEnv)
    return fromEnv;

  return devBackendHttpOrigin();
}

/** @deprecated 使用 resolveHkRelayHttpOrigin */
export function resolvePmHkRelayHttpOrigin(): string {
  return resolveHkRelayHttpOrigin();
}
