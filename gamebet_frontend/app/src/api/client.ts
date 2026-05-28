import type { ApiEnvelope } from "@/types/esport";

const JSON_HEADERS = { "Content-Type": "application/json" };

let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("app:token") : null;

export function getToken(): string | null {
  return authToken;
}

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("app:token", token);
  else localStorage.removeItem("app:token");
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
      const hint = text ? `: ${text.slice(0, 160)}` : "";
      if (res.status === 502 || res.status === 503) {
        throw new Error(`后端未连接，请先运行 backend.bat 或 dev.bat${hint}`);
      }
      throw new Error(`${action} HTTP ${res.status}${hint}`);
    }
    try {
      return JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      throw new Error(`${action} 响应无效: ${text.slice(0, 120)}`);
    }
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
