/**
 * [changmen 扩展] PB WS 影子价旁显 — 仅本机 localStorage，不进 Extensions / RDS。
 *
 * 未写过子开关时：跟「PB changmen 扩展」走（开扩展即开影子，避免侧栏已 CONNECTED 仍无 M）。
 * 显式关写 `"0"`，显式开写 `"1"`。
 */
import { readPbChangmenExtensionsLocal } from "@/shared/pbExtensionsLocal";

export const PB_WS_SHADOW_UI_LOCAL_KEY = "changmen:pbWsShadowUi";

export function readPbWsShadowUiLocal(): boolean {
  try {
    const raw = localStorage.getItem(PB_WS_SHADOW_UI_LOCAL_KEY);
    if (raw === "0")
      return false;
    if (raw === "1")
      return true;
    return readPbChangmenExtensionsLocal();
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
      localStorage.setItem(PB_WS_SHADOW_UI_LOCAL_KEY, "0");
  }
  catch {
    /* private mode / quota */
  }
}
