import type { PlatformAccount } from "@/models/platformAccount";

function balanceUsesBackendRelay(account: PlatformAccount): boolean {
  return Boolean(account.proxyId);
}

function isBackendRelayErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return /3456|http-relay|127\.0\.0\.1|后端未连接|start-web|start-dev/.test(lower);
}

function isVenueNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return /failed to fetch|networkerror|network error|econnrefused|load failed|net::err_/.test(
    lower,
  );
}

export function normalizeBalanceError(err: unknown, account: PlatformAccount): string {
  const raw = err instanceof Error ? err.message : String(err || "");
  let message = raw.trim();
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as { error?: string; hint?: string; msg?: string };
      message = parsed.msg || parsed.error || message;
      if (parsed.hint && parsed.error === "RAY not configured") {
        return "token error";
      }
    } catch {
      /* keep raw */
    }
  }
  const lower = message.toLowerCase();
  if (isVenueNetworkError(message)) {
    if (balanceUsesBackendRelay(account) || isBackendRelayErrorMessage(message)) {
      return "本机 HTTP 代理未连接，请先运行 npm run web（3456）";
    }
    return `无法连接 ${account.provider} 场馆，请检查 gateway、Token；浏览器直连时还可能是跨域 (CORS) 被拦截`;
  }
  if (/ray not configured/.test(lower)) {
    return "token error";
  }
  if (!message || /token|auth|401|403|login|credential|请先登录/.test(lower)) {
    return "token error";
  }
  return message;
}
