import { getRefreshToken, getToken } from "@/api/client";

/** JWT 模式：Client_RefreshToken 续期 */
export async function ensureTokenRefresh(): Promise<void> {
  const jwt = getToken();
  const rft = getRefreshToken();
  if (!jwt || !rft)
    return;

  const { refreshJwtSession, startJwtAutoRefresh } = await import("@/lib/jwtRefresh");
  await refreshJwtSession().catch(() => {});
  startJwtAutoRefresh();
}

export async function stopTokenRefresh(): Promise<void> {
  try {
    const { stopJwtAutoRefresh } = await import("@/lib/jwtRefresh");
    stopJwtAutoRefresh();
  }
  catch {
    /* ignore */
  }
}
