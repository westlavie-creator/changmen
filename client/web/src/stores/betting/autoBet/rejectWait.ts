import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { a8Tip } from "@/shared/a8Notify";
import { makeUpBetToastSeconds } from "@/shared/betTiming";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";

/** @deprecated 套利并行检测后仅用于兼容；请用 legRejectWaitSec / maxLegRejectWaitSec */
export function rejectWaitSeconds(config: UserConfig, accounts: PlatformAccount[]): number {
  if (!accounts.length)
    return 0;
  return Math.max(...accounts.map(a => config.waitTime[a.provider] ?? 5));
}

/** 套利单腿：场馆层拒单检测等待秒数（PM 走 settle，不读 waitTime） */
export function legRejectWaitSec(config: UserConfig, provider: string): number {
  if (provider === PLATFORMS.Polymarket)
    return 0;
  const wait = config.waitTime[provider];
  if (wait === -1)
    return 0;
  return wait ?? 5;
}

/** 补单单腿：对齐 A8 Pe（max(wait,10)）；-1 由编排层跳过检测 */
export function makeupLegRejectWaitSec(config: UserConfig, provider: string): number {
  if (provider === PLATFORMS.Polymarket)
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

/** [A8 可证实] 补单等仍用阻塞等待；自动套利改由场馆层 rejectWaitSec 承担 */
export async function waitRejectDetection(countdownSec: number, actualWaitSec: number) {
  if (countdownSec > 0) {
    a8Tip("拒单检测", `等待<countdown>${countdownSec}</countdown>秒`, countdownSec * 1000);
  }
  if (actualWaitSec <= 0)
    return;
  for (let i = 0; i < actualWaitSec; i++) {
    await wait(1000);
  }
}
