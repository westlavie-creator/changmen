import type { BetSide } from "@/models/match";
import { ensureGoEasyConnected, goeasyPublish } from "@/realtime/goeasyClient";

/** [A8 可证实] bundle `pke="BetTarget"` */
export const BET_TARGET_CHANNEL = "BetTarget";

/** [A8 可证实] `Ut.saveBetTarget`：发布全量快照，3s 内等 publish 回调 */
export async function publishBetTargetPayload(
  payload: Record<string, Record<string, BetSide>>,
  timeoutMs = 3000,
): Promise<boolean> {
  await ensureGoEasyConnected();
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);
    void goeasyPublish(BET_TARGET_CHANNEL, JSON.stringify(payload)).then((ok) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        resolve(ok);
      }
    });
  });
}
