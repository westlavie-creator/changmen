import { opponentSide } from "@/models/betOption";
import type { PlatformId } from "@/types/esport";
import { isA8StrictMode } from "@/shared/a8Strict";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { arbAccountPickerFilter } from "@/extensions/arbBet/rate9999";
import { readUsedAccounts } from "@/stores/betting/successMarkers";
import { createArbFlowTrace } from "@/extensions/arbBet/betTrace";
import type { ArbBetAttemptParams, ArbBetReady } from "@/stores/betting/autoBet/phases/types";

/** 选腿、选号、rate9999 / linkId；失败时内部 trace.finish 并返回 null */
export async function prepareArbAttempt(
  params: ArbBetAttemptParams,
): Promise<ArbBetReady | null> {
  const { match, bet, config } = params;
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const strictA8 = isA8StrictMode();

  if (loseStore.orders.has(bet.id)) return null;

  bet.items.forEach((item) => item.updateOdds());

  const providerKeys = [...accountStore.getProviders().keys()] as PlatformId[];
  const options = bet.getOrderOptions(match, config, accountStore.accounts, providerKeys);
  if (!options || options.length !== 2) return null;

  let legA = options[0];
  let legB = options[1];
  const implied = 1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);
  const trace = createArbFlowTrace(match, bet, {
    implied,
    homeLine: `${legA.type}@${legA.odds}`,
    awayLine: `${legB.type}@${legB.odds}`,
  });

  let accountA = accountStore.getAccount(
    legA.type,
    legA.betMoney,
    config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [],
    (acc) => arbAccountPickerFilter(acc, bet, match, legA, matchStore, implied),
    options,
  );
  let accountB = accountStore.getAccount(
    legB.type,
    legB.betMoney,
    config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [],
    (acc) => arbAccountPickerFilter(acc, bet, match, legB, matchStore, implied),
    options,
  );
  if (!accountA && !accountB) {
    trace.finish("fail", "无可用账号");
    return null;
  }

  if (accountA) trace.event("选号", `${accountA.provider}/${accountA.playerName}`);
  if (accountB) trace.event("选号", `${accountB.provider}/${accountB.playerName}`);

  const betBothLegs = Boolean(accountA) && Boolean(accountB);
  let linkId: number;

  if (strictA8) {
    if (!betBothLegs) {
      trace.finish("fail", "严格模式需双腿账号");
      return null;
    }
    linkId = Date.now();
  } else {
    const { allowArbBetExecution, createArbLinkId, resolveRate9999SingleLeg } =
      await import("@/extensions/arbBet");
    const excludeA = config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [];
    const excludeB = config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [];
    const rate9999SingleLeg = resolveRate9999SingleLeg({
      betBothLegs,
      accountA,
      accountB,
      legA,
      legB,
      bet,
      match,
      accounts: accountStore.accounts,
      excludeA,
      excludeB,
      matchStore,
      implied,
    });
    if (!allowArbBetExecution(betBothLegs, rate9999SingleLeg)) {
      trace.finish("skip", "不满足下单条件");
      return null;
    }
    linkId = createArbLinkId(rate9999SingleLeg);
  }

  return {
    legA,
    legB,
    accountA,
    accountB,
    implied,
    trace,
    betBothLegs,
    linkId,
    strictA8,
  };
}
