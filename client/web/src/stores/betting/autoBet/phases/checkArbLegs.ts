import { BetOption } from "@/models/betOption";
import { arbBetToastSeconds } from "@/shared/betTiming";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";
import { useAccountStore } from "@/stores/accountStore";
import type { ArbBetAttemptParams, ArbBetChecked, ArbBetReady } from "@/stores/betting/autoBet/phases/types";

/** 预检双腿；失败时返回 null */
export async function checkArbLegs(
  params: ArbBetAttemptParams,
  ready: ArbBetReady,
): Promise<ArbBetChecked | null> {
  const { config, setMessage } = params;
  const accountStore = useAccountStore();
  let { legA, legB, accountA, accountB, betBothLegs } = ready;

  if (accountA) accountA.active = true;
  if (accountB) accountB.active = true;
  const checkStart = Date.now();
  const checkTasks: Promise<BetOption>[] = [];
  if (accountA) checkTasks.push(accountStore.checkBetting(accountA, legA));
  if (accountB) checkTasks.push(accountStore.checkBetting(accountB, legB));
  const checked = await Promise.all(checkTasks);
  let checkIdx = 0;
  if (accountA) legA = checked[checkIdx++];
  if (accountB) legB = checked[checkIdx++];
  if ((accountA && !legA.data) || (accountB && !legB.data)) {
    await wait(1000);
    return null;
  }

  // [A8 可证实] orderIndex 在 checkTimeout 之前赋值
  if (accountA) legA.orderIndex = 1;
  if (accountB) legB.orderIndex = betBothLegs ? 2 : 1;
  if (config.checkTimeout && Date.now() - checkStart > config.checkTimeout) {
    const elapsed = Date.now() - checkStart;
    const msg = `超时时间：${elapsed}ms，大于设定值：${config.checkTimeout}ms`;
    setMessage(`前置检查超时 ${elapsed}ms`);
    a8Tip("前置检查超时", msg, 3000);
    return null;
  }

  const waitSec = arbBetToastSeconds(
    config,
    [accountA?.provider, accountB?.provider].filter(Boolean) as string[],
  );

  return {
    ...ready,
    legA,
    legB,
    accountA,
    accountB,
    waitSec,
  };
}
