import { getRefreshToken, getToken } from "@/api/client";

/** Supabase 可用时用其续期；纯 RDS/JWT 模式则走 Client_RefreshToken */
export async function ensureTokenRefresh(): Promise<void> {
  const jwt = getToken();
  const rft = getRefreshToken();
  if (!jwt || !rft) return;

  try {
    const { initSupabaseClient } = await import("@/lib/supabase");
    const client = await initSupabaseClient(jwt, rft);
    if (client) return;
  } catch {
    /* 无 Supabase 配置时走 JWT 刷新 */
  }

  const { refreshJwtSession, startJwtAutoRefresh } = await import("@/lib/jwtRefresh");
  await refreshJwtSession().catch(() => {});
  startJwtAutoRefresh();
}

export async function stopTokenRefresh(): Promise<void> {
  try {
    const { destroySupabaseClient } = await import("@/lib/supabase");
    destroySupabaseClient();
  } catch {
    /* ignore */
  }
  try {
    const { stopJwtAutoRefresh } = await import("@/lib/jwtRefresh");
    stopJwtAutoRefresh();
  } catch {
    /* ignore */
  }
}
