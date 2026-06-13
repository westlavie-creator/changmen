import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";

export function rejectWaitSeconds(config: UserConfig, accounts: PlatformAccount[]): number {
  if (!accounts.length) return 0;
  return Math.max(...accounts.map((a) => config.waitTime[a.provider] ?? 5));
}

export async function waitRejectDetection(countdownSec: number, actualWaitSec: number) {
  if (actualWaitSec <= 0) return;
  a8Tip("拒单检测", `等待<countdown>${countdownSec}</countdown>秒`, countdownSec * 1000);
  for (let i = 0; i < actualWaitSec; i++) {
    await wait(1000);
  }
}
