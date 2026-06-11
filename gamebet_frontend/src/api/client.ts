import type { ApiEnvelope } from "@/types/esport";

const JSON_HEADERS = { "Content-Type": "application/json" };
const TOKEN_COOKIE = "app_token";

function readTokenCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )app_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function syncTokenCookie(token: string | null) {
  if (typeof document === "undefined") return;
  if (token) {
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  } else {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("app:token") : null;
if (!authToken) authToken = readTokenCookie();
if (authToken) syncTokenCookie(authToken);

let refreshToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("app:refresh-token") : null;

export function getRefreshToken(): string | null { return refreshToken; }

export function setRefreshToken(token: string | null) {
  refreshToken = token;
  if (typeof localStorage !== "undefined") {
    if (token) localStorage.setItem("app:refresh-token", token);
    else localStorage.removeItem("app:refresh-token");
  }
}

export function getToken(): string | null {
  return authToken;
}

export function setToken(token: string | null) {
  authToken = token;
  if (typeof localStorage !== "undefined") {
    if (token) localStorage.setItem("app:token", token);
    else localStorage.removeItem("app:token");
  }
  syncTokenCookie(token);
}

export function authHeaders(): Record<string, string> {
  return authToken ? { token: authToken } : {};
}

export async function post<T>(
  action: string,
  body: Record<string, unknown> = {},
  query = "",
): Promise<ApiEnvelope<T>> {
  const started = Date.now();
  try {
    const res = await fetch(`/esport/${action}${query}`, {
      method: "POST",
      headers: { ...JSON_HEADERS, ...authHeaders() },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let serverMsg = "";
      try {
        const parsed = JSON.parse(text) as { msg?: string };
        if (parsed?.msg) serverMsg = parsed.msg;
      } catch {
        /* 非 JSON 响应 */
      }
      const hint = text && !serverMsg ? `: ${text.slice(0, 160)}` : "";
      if (res.status === 502 || res.status === 503 || (res.status === 500 && !serverMsg)) {
        throw new Error(
          `后端未连接或未就绪，请先运行 backend.bat 或 dev.bat（VPS 请等 pm2 重启后再试）${hint}`,
        );
      }
      throw new Error(serverMsg || `${action} HTTP ${res.status}${hint}`);
    }
    let json: ApiEnvelope<T>;
    try {
      json = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      throw new Error(`${action} 响应无效: ${text.slice(0, 120)}`);
    }

    // 被新登录踢出：清除 token 并跳回登录页
    if (json.success === 0 && json.msg === "请先登录" && action !== "Client_Login") {
      setToken(null);
      window.location.href = "/";
    }
    return json;
  } finally {
    // 对齐 A8：延迟取样来自任意 API 请求耗时，而非专门心跳请求。
    try {
      const { useUserStore } = await import("@/stores/userStore");
      useUserStore().setApiDelay(Date.now() - started);
    } catch {
      // 登录前或 pinia 尚未就绪时忽略。
    }
  }
}

export function unwrap<T>(data: ApiEnvelope<T>): T {
  if (data.success !== 1) throw new Error(data.msg || "请求失败");
  return data.info as T;
}
