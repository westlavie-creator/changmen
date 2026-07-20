import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";

/** 套利单腿：场馆层拒单检测等待秒数（PM/PF 走 settle，不读 waitTime） */
export function legRejectWaitSec(config: UserConfig, provider: string): number {
  if (isPendingConfirmVenueProvider(provider))
    return 0;
  const wait = config.waitTime[provider];
  if (wait === -1)
    return 0;
  return wait ?? 5;
}

/** 补单单腿：对齐 A8 Pe（max(wait,10)）；-1 由编排层跳过检测；PM/PF 为 0 */
export function makeupLegRejectWaitSec(config: UserConfig, provider: string): number {
  if (isPendingConfirmVenueProvider(provider))
    return 0;
  if (config.waitTime[provider] === -1)
    return 0;
  return makeUpBetToastSeconds(config, provider);
}

/** 套利 UI 倒计时：各成功腿场馆等待的最大值 */
export function maxLegRejectWaitSec(config: UserConfig, accounts: PlatformAccount[]): number {
  if (!accounts.length)
    return 0;
  return Math.max(0, ...accounts.map(a => legRejectWaitSec(config, a.provider)));
}

/** 仅展示 Oe 倒计时，不阻塞（实际等待在场馆 resolveLegOutcome） */
export async function showRejectDetectionTip(countdownSec: number) {
  if (countdownSec > 0) {
    a8Tip("拒单检测", `等待<countdown>${countdownSec}</countdown>秒`, countdownSec * 1000);
  }
}
