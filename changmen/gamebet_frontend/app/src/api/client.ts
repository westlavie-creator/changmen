import type { ApiEnvelope } from "@/types/esport";

const JSON_HEADERS = { "Content-Type": "application/json" };

let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("app:token") : null;

/** Electron packaged 模式下 preload 注入的 IPC bridge；dev / web 环境下 esport 为 undefined */
function electronApi(): { esport: (a: string, b: unknown, t: string) => Promise<unknown> } | undefined {
  const api = (window as unknown as { gamebetApi?: { esport?: unknown } }).gamebetApi;
  return typeof api?.esport === "function"
    ? (api as { esport: (a: string, b: unknown, t: string) => Promise<unknown> })
    : undefined;
}

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
    let json: ApiEnvelope<T>;
    const api = electronApi();

    if (api) {
      // Electron：IPC 直调 main process，绕过 localhost HTTP
      json = (await api.esport(action, body, authToken ?? "")) as ApiEnvelope<T>;
    } else {
      // Web：标准 HTTP fetch
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
        json = JSON.parse(text) as ApiEnvelope<T>;
      } catch {
        throw new Error(`${action} 响应无效: ${text.slice(0, 120)}`);
      }
    }

    // 被新登录踢出：清除 token 并跳回登录页
    if (json.success === 0 && json.msg === "请先登录" && action !== "Client_Login") {
      setToken(null);
      window.location.href = "/app/";
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
