/** Polymarket HTTP 出海方式：业务层只调 transport / pmClientApi，由 mode 决定实际路径 */

export type PmHttpMode = "direct" | "vps" | "extension";

const LS_KEY = "PM_HTTP_MODE";

let testOverride: PmHttpMode | null = null;

function normalizeMode(raw: string | undefined | null): PmHttpMode | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "direct" || v === "official")
    return "direct";
  if (v === "vps" || v === "server")
    return "vps";
  if (v === "extension" || v === "plugin")
    return "extension";
  return null;
}

/** 当前 PM HTTP 模式；默认 vps */
export function resolvePmHttpMode(): PmHttpMode {
  if (testOverride)
    return testOverride;
  if (typeof localStorage !== "undefined") {
    const fromLs = normalizeMode(localStorage.getItem(LS_KEY));
    if (fromLs)
      return fromLs;
  }
  const env = typeof import.meta !== "undefined"
    ? normalizeMode((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PM_HTTP_MODE)
    : null;
  if (env)
    return env;
  return "vps";
}

/** 余额/语义 API 是否经 changmen VPS（否则浏览器 + 插件/direct） */
export function isPmVpsHttpMode(): boolean {
  return resolvePmHttpMode() === "vps";
}

/** 测试 / 调试注入 */
export function setPmHttpModeForTests(mode: PmHttpMode | null): void {
  testOverride = mode;
}

export function setPmHttpMode(mode: PmHttpMode): void {
  if (typeof localStorage === "undefined")
    return;
  localStorage.setItem(LS_KEY, mode);
}
