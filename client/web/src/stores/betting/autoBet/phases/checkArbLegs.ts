import type { BetOption } from "@/models/betOption";
import type { ArbBetAttemptParams, ArbBetChecked, ArbBetReady } from "@/stores/betting/autoBet/phases/types";
import { isSingleLegPrecheckOnly } from "@/domain/betting/singleLegRate";
import { setArbExecutionTraceMeta } from "@/stores/betting/autoBet/arbProgressTrace";
import { a8Tip } from "@/shared/a8Notify";
import { buildArbProgressLegPair } from "@/shared/arbProgressLegMeta";
import { arbBetToastSeconds } from "@/shared/betTiming";
import { wait } from "@/shared/wait";
import { getPolymarketPmSportBlockReasonFromOption } from "@venue/polymarket";
import { PLATFORMS } from "@/shared/platform";
import { useAccountStore } from "@/stores/accountStore";
import {
  scheduleActiveBetRunRemoval,
  syncActiveBetFail,
  syncActiveBetLeg,
  syncActiveBetPhase,
} from "@/stores/betting/activeBetRunSync";

function stripPrecheckError(raw?: string): string {
  if (!raw)
    return "";
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** 预检双腿；失败时 trace.finish 并返回 null */
export async function checkArbLegs(
  params: ArbBetAttemptParams,
  ready: ArbBetReady,
): Promise<ArbBetChecked | null> {
  const { bet, config, setMessage, trace } = params;
  const accountStore = useAccountStore();
  let {
    legA,
    legB,
    accountA,
    accountB,
    checkAccountA,
    checkAccountB,
    betBothLegs,
  } = ready;
  checkAccountA = checkAccountA ?? accountA;
  checkAccountB = checkAccountB ?? accountB;

  syncActiveBetPhase(bet.id, "checking", "账号预检");

  if (checkAccountA)
    checkAccountA.active = true;
  if (checkAccountB)
    checkAccountB.active = true;

  for (const [account, leg, side] of [
    [checkAccountA, legA, "A"] as const,
    [checkAccountB, legB, "B"] as const,
  ]) {
    if (!account || leg.type !== PLATFORMS.Polymarket)
      continue;
    const pmBlock = getPolymarketPmSportBlockReasonFromOption(leg);
    if (pmBlock) {
      trace?.finish("fail", `${leg.type} ${leg.target}: ${pmBlock}`);
      syncActiveBetLeg(bet.id, side, "failed", pmBlock);
      scheduleActiveBetRunRemoval(bet.id);
      await wait(1000);
      return null;
    }
  }

  const checkStart = Date.now();

  const checkTasks: Promise<BetOption>[] = [];
  if (checkAccountA) {
    checkTasks.push(accountStore.checkBetting(checkAccountA, legA, {
      skipAccountRate: isSingleLegPrecheckOnly(
        "A",
        accountA,
        accountB,
        checkAccountA,
        checkAccountB,
      ),
    }));
  }
  if (checkAccountB) {
    checkTasks.push(accountStore.checkBetting(checkAccountB, legB, {
      skipAccountRate: isSingleLegPrecheckOnly(
        "B",
        accountA,
        accountB,
        checkAccountA,
        checkAccountB,
      ),
    }));
  }
  const checked = await Promise.all(checkTasks);
  let checkIdx = 0;
  if (checkAccountA)
    legA = checked[checkIdx++];
  if (checkAccountB)
    legB = checked[checkIdx++];

  const precheckLegs = buildArbProgressLegPair(
    legA,
    legB,
    checkAccountA,
    checkAccountB,
    {
      legA: checkAccountA
        ? { ok: Boolean(legA.data), error: legA.checkError }
        : undefined,
      legB: checkAccountB
        ? { ok: Boolean(legB.data), error: legB.checkError }
        : undefined,
    },
    trace?.getMeta()?.legs,
  );
  setArbExecutionTraceMeta(trace, { legs: precheckLegs });
  trace?.event("预检", "见下方对冲腿详情");

  function legPrecheckFailLabel(side: "A" | "B"): string | null {
    const leg = side === "A" ? legA : legB;
    const checkAccount = side === "A" ? checkAccountA : checkAccountB;
    if (!checkAccount || leg.data)
      return null;
    const base = `${leg.type} ${leg.target}: ${leg.checkError || "无盘口数据"}`;
    if (isSingleLegPrecheckOnly(side, accountA, accountB, checkAccountA, checkAccountB))
      return `${base}（9999仅预检）`;
    return base;
  }

  if ((checkAccountA && !legA.data) || (checkAccountB && !legB.data)) {
    const parts = [
      legPrecheckFailLabel("A"),
      legPrecheckFailLabel("B"),
    ].filter(Boolean);
    if (checkAccountA && !legA.data) {
      const detail = stripPrecheckError(legA.checkError) || "无盘口数据";
      syncActiveBetLeg(bet.id, "A", "failed", detail);
    }
    if (checkAccountB && !legB.data) {
      const detail = stripPrecheckError(legB.checkError) || "无盘口数据";
      syncActiveBetLeg(bet.id, "B", "failed", detail);
    }
    trace?.finish("fail", parts.join(" · ") || "预检未通过");
    scheduleActiveBetRunRemoval(bet.id);
    await wait(1000);
    return null;
  }

  // [A8 可证实] 预检通过后不再改 betMoney（PM 同：计划额 + 场馆跌价拒单）；orderIndex 在 checkTimeout 之前赋值
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
    syncActiveBetFail(bet.id, msg);
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
