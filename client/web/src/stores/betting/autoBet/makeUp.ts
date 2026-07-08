import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import type { useLoseOrderStore } from "@/stores/loseOrderStore";
import type { UserConfig } from "@/types/userConfig";
import { getDefaultOdds } from "@/api/report";
import { LoseOrder } from "@/models/loseOrder";
import { a8Tip } from "@/shared/a8Notify";
import { saveLinkBetContext } from "@/stores/betting/linkBetContext";
import { wait } from "@/shared/wait";

/** 对齐 bundle `S()`：补单前初赔 / 当前赔阈值 */
export async function allowMakeUpForLeg(
  match: ViewMatch,
  bet: ViewBet,
  target: BetSide,
  currentOdds: number,
  config: UserConfig,
  setMessage: (msg: string) => void,
): Promise<boolean> {
  let denyReason: string | undefined;
  if (config.makeUp_defaultOdds !== 0) {
    const def = await getDefaultOdds({
      matchId: match.id,
      betId: bet.id,
      team: target,
    });
    if (def !== 0 && config.makeUp_defaultOdds <= def) {
      denyReason = `初赔赔率:${def}，大于当前设定值：${config.makeUp_defaultOdds}`;
    }
  }
  if (!denyReason && config.makeUp_odds !== 0 && config.makeUp_odds <= currentOdds) {
    denyReason = `当前赔率:${currentOdds}，大于当前设定值：${config.makeUp_odds}`;
  }
  if (denyReason) {
    setMessage(`不予补单：${denyReason}`);
    a8Tip("不予补单提醒", denyReason, 3000);
    return false;
  }
  return true;
}

export async function enqueueMakeUpOrder(params: {
  loseStore: ReturnType<typeof useLoseOrderStore>;
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
  linkId: number;
  accountId: number;
  target: BetSide;
  betMoney: number;
  betOdds: number;
  failedLegOdds: number;
  failedPlatformLabel: string;
}): Promise<boolean> {
  const {
    loseStore,
    match,
    bet,
    config,
    setMessage,
    linkId,
    accountId,
    target,
    betMoney,
    betOdds,
    failedLegOdds,
    failedPlatformLabel,
  } = params;

  const okMakeUp = await allowMakeUpForLeg(
    match,
    bet,
    target,
    failedLegOdds,
    config,
    setMessage,
  );
  if (!okMakeUp)
    return false;

  loseStore.createOrder(
    new LoseOrder({
      accountId,
      matchId: match.id,
      betId: bet.id,
      target,
      betMoney,
      betOdds,
      match: match.title,
      bet: bet.getBetName(),
      linkId,
      createAt: Date.now(),
      isCreateOrder: false,
      betCount: 1,
    }),
  );
  saveLinkBetContext(linkId, match.id, bet.id);
  await wait(500);
  setMessage(`${failedPlatformLabel} 下单失败，已加入补单队列`);
  a8Tip("补单提醒", `${failedPlatformLabel} 下单失败，创建补单队列`, 3000);
  return true;
}
