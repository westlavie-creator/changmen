/**
 * [changmen 扩展] PB WS 影子价旁显 — 仅本机 localStorage，不进 Extensions / RDS。
 */
export const PB_WS_SHADOW_UI_LOCAL_KEY = "changmen:pbWsShadowUi";

export function readPbWsShadowUiLocal(): boolean {
  try {
    return localStorage.getItem(PB_WS_SHADOW_UI_LOCAL_KEY) === "1";
  }
  catch {
    return false;
  }
}

export function writePbWsShadowUiLocal(on: boolean): void {
  try {
    if (on)
      localStorage.setItem(PB_WS_SHADOW_UI_LOCAL_KEY, "1");
    else
      localStorage.removeItem(PB_WS_SHADOW_UI_LOCAL_KEY);
  }
  catch {
    /* private mode / quota */
  }
}
