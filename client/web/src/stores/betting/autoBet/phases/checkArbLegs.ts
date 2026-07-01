import type { BetOption } from "@/models/betOption";
import type { ArbBetAttemptParams, ArbBetChecked, ArbBetReady } from "@/stores/betting/autoBet/phases/types";
import { a8Tip } from "@/shared/a8Notify";
import { formatBetResult } from "@/shared/arbBetTraceFormat";
import { arbBetToastSeconds } from "@/shared/betTiming";
import { wait } from "@/shared/wait";
import { useAccountStore } from "@/stores/accountStore";

/** 预检双腿；失败时 trace.finish 并返回 null */
export async function checkArbLegs(
  params: ArbBetAttemptParams,
  ready: ArbBetReady,
): Promise<ArbBetChecked | null> {
  const { config, setMessage, trace } = params;
  const accountStore = useAccountStore();
  let { legA, legB, accountA, accountB, betBothLegs } = ready;

  if (accountA)
    accountA.active = true;
  if (accountB)
    accountB.active = true;
  const checkStart = Date.now();
  const checkTasks: Promise<BetOption>[] = [];
  if (accountA)
    checkTasks.push(accountStore.checkBetting(accountA, legA));
  if (accountB)
    checkTasks.push(accountStore.checkBetting(accountB, legB));
  const checked = await Promise.all(checkTasks);
  let checkIdx = 0;
  if (accountA)
    legA = checked[checkIdx++];
  if (accountB)
    legB = checked[checkIdx++];

  const legALine = accountA
    ? formatBetResult(legA.type, legA.target, legA.betMoney, legA.odds, {
        success: Boolean(legA.data),
      })
    : null;
  const legBLine = accountB
    ? formatBetResult(legB.type, legB.target, legB.betMoney, legB.odds, {
        success: Boolean(legB.data),
      })
    : null;
  if (legALine || legBLine) {
    trace?.event("预检", [legALine, legBLine].filter(Boolean).join(" · "));
  }

  if ((accountA && !legA.data) || (accountB && !legB.data)) {
    const parts = [
      accountA && !legA.data
        ? `${legA.type} ${legA.target}: ${legA.checkError || "无盘口数据"}`
        : null,
      accountB && !legB.data
        ? `${legB.type} ${legB.target}: ${legB.checkError || "无盘口数据"}`
        : null,
    ].filter(Boolean);
    trace?.finish("fail", parts.join(" · ") || "预检未通过");
    await wait(1000);
    return null;
  }

  // [A8 可证实] 预检通过后不再改 betMoney；orderIndex 在 checkTimeout 之前赋值
  if (accountA)
    legA.orderIndex = 1;
  if (accountB)
    legB.orderIndex = betBothLegs ? 2 : 1;
  if (config.checkTimeout && Date.now() - checkStart > config.checkTimeout) {
    const elapsed = Date.now() - checkStart;
    const msg = `超时时间：${elapsed}ms，大于设定值：${config.checkTimeout}ms`;
    setMessage(`前置检查超时 ${elapsed}ms`);
    a8Tip("前置检查超时", msg, 3000);
    trace?.finish("fail", msg);
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
    implied: ready.implied,
    waitSec,
  };
}
