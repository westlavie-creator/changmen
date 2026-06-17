import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";

export function rejectWaitSeconds(config: UserConfig, accounts: PlatformAccount[]): number {
  if (!accounts.length) return 0;
  return Math.max(...accounts.map((a) => config.waitTime[a.provider] ?? 5));
}

/** [A8 可证实] 自动套利：先 `Pr.tip` 用 Oe 显示 countdown，再 `for(ue<q) wait(1s)`；q<=0 仍弹窗 */
export async function waitRejectDetection(countdownSec: number, actualWaitSec: number) {
  if (countdownSec > 0) {
    a8Tip("拒单检测", `等待<countdown>${countdownSec}</countdown>秒`, countdownSec * 1000);
  }
  if (actualWaitSec <= 0) return;
  for (let i = 0; i < actualWaitSec; i++) {
    await wait(1000);
  }
}
