/** 足球页账号「快速填充」写入体育会话后，通知采集条刷新。不进 ACCOUNT。 */
export const SPORT_OB_SESSION_UPDATED = "changmen:sport-ob-session-updated";

export function notifySportObSessionUpdated() {
  if (typeof window === "undefined")
    return;
  window.dispatchEvent(new Event(SPORT_OB_SESSION_UPDATED));
}
