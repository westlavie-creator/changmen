import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { post, setToken } from "@/api/client";

let _client: SupabaseClient | null = null;

export async function initSupabaseClient(
  jwt: string,
  refreshToken: string,
): Promise<SupabaseClient | null> {
  if (_client) return _client; // 已初始化，直接复用
  try {
    const res = await post<{ url: string; anonKey: string }>("Client_GetSupabaseConfig", {});
    const cfg = res.info as { url: string; anonKey: string };
    if (!cfg?.url || !cfg?.anonKey) return null;

    _client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    });

    // 用真实 refresh_token 建立 session，autoRefreshToken 自动在到期前换新
    await _client.auth.setSession({ access_token: jwt, refresh_token: refreshToken });

    // token 刷新后同步到 api/client，保证后续 API 请求用新 token
    _client.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        setToken(session.access_token);
      }
    });

    return _client;
  } catch {
    return null;
  }
}

export function destroySupabaseClient(): void {
  if (_client) {
    _client.auth.stopAutoRefresh();
    _client = null;
  }
}
