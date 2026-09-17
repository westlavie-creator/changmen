/**
 * 足球板 UI 偏好。只存在本机 localStorage，不进 USERCONFIG。
 */
export const FOOTBALL_BOARD_SHOW_LIVE_KEY = "changmen:footballBoardShowLive";

export function readFootballBoardShowLive(): boolean {
  try {
    const raw = localStorage.getItem(FOOTBALL_BOARD_SHOW_LIVE_KEY);
    if (raw == null)
      return true;
    if (raw === "0" || raw === "false")
      return false;
    return true;
  }
  catch {
    return true;
  }
}

export function writeFootballBoardShowLive(show: boolean): void {
  try {
    localStorage.setItem(FOOTBALL_BOARD_SHOW_LIVE_KEY, show ? "1" : "0");
  }
  catch {
    /* ignore */
  }
}
