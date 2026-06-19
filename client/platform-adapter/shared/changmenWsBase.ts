/** dev 下实时 WS 直连 backend（Vite 对 upgrade 代理不可靠） */
export function changmenDevBackendOrigin(): string {
  const isWin =
    typeof navigator !== "undefined"
      ? /win/i.test(navigator.platform || navigator.userAgent)
      : typeof process !== "undefined" && process.platform === "win32";
  const port = isWin ? 3560 : 3456;
  return `http://127.0.0.1:${port}`;
}

/** `VITE_API_BASE` > dev 直连 backend > 同源 */
export function resolveChangmenWsBase(): string {
  if (typeof window !== "undefined") {
    const envBase =
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      String(import.meta.env.VITE_API_BASE || "").trim();
    if (envBase) return String(envBase).replace(/\/+$/, "");
    if (import.meta.env?.DEV) return changmenDevBackendOrigin();
    return window.location.origin;
  }
  return changmenDevBackendOrigin();
}

export function changmenHttpBaseToWs(base: string): string {
  return base.replace(/^http/i, "ws");
}
