import { clearAuthSession, getRefreshToken, post, setRefreshToken, setToken, unwrap } from "@/api/client";

let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshJwtSession(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt)
    return false;
  try {
    const info = unwrap(
      await post<{ token: string; refreshToken?: string }>("Client_RefreshToken", {
        refreshToken: rt,
      }),
    );
    setToken(info.token);
    if (info.refreshToken)
      setRefreshToken(info.refreshToken);
    return true;
  }
  catch {
    clearAuthSession();
    return false;
  }
}

/** 默认每 6 小时刷新（access token 通常 7 天） */
export function startJwtAutoRefresh(intervalMs = 6 * 60 * 60 * 1000) {
  stopJwtAutoRefresh();
  timer = setInterval(() => {
    void refreshJwtSession();
  }, intervalMs);
}

export function stopJwtAutoRefresh() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
