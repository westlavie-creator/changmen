import { opponentSide } from "@/models/betOption";
import type { PlatformId } from "@/types/esport";
import {
  allowArbBetExecution,
  arbAccountPickerFilter,
  createArbLinkId,
  explainAllowArbRejection,
  resolveSingleLegByRate,
} from "@/extensions/arbBet/rate9999";
import { describeGetOrderOptionsSkip } from "@/extensions/notify/describeArbPrepareSkip";
import {
  formatLegAccount,
  setArbExecutionTraceMeta,
} from "@/extensions/notify";
import { arbProfitRate } from "@/shared/format";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { readUsedAccounts } from "@/stores/betting/successMarkers";
import type { ArbBetAttemptParams, ArbBetReady } from "@/stores/betting/autoBet/phases/types";

/** 选腿、选号、比例 9999 单边 / linkId；失败时 return null（A8 静默 continue） */
export async function prepareArbAttempt(
  params: ArbBetAttemptParams,
): Promise<ArbBetReady | null> {
  const { match, bet, config, trace } = params;
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();

  bet.items.forEach((item) => item.updateOdds());

  const providerKeys = [...accountStore.getProviders().keys()] as PlatformId[];
  const accounts = accountStore.accounts;

  if (loseStore.orders.has(bet.id)) {
    trace?.event("准备", "该盘口已在补单队列");
    trace?.finish("skip", "该盘口已在补单队列，自动套利已跳过");
    return null;
  }

  // [A8 可证实] 每个 bet 循环内 roll（非每轮一次）
  if (config.minMoney !== 0 && config.maxMoney !== 0) {
    config.betMoney =
      Math.floor(Math.random() * (config.maxMoney - config.minMoney + 1)) + config.minMoney;
  }

  const options = bet.getOrderOptions(match, config, accounts, providerKeys);
  if (!options || options.length !== 2) {
    const skipReason = describeGetOrderOptionsSkip(
      bet,
      match,
      config,
      providerKeys,
      accounts,
    );
    trace?.event(
      "检测",
      `执行平台 ${providerKeys.length ? providerKeys.join(", ") : "（无）"} · ${skipReason}`,
    );
    trace?.finish("skip", skipReason);
    return null;
  }

  let legA = options[0];
  let legB = options[1];
  const implied = 1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);
  setArbExecutionTraceMeta(trace, {
    implied,
    homeLine: `${legA.type}@${legA.odds}`,
    awayLine: `${legB.type}@${legB.odds}`,
  });
  trace?.event(
    "检测",
    `平台 ${providerKeys.join(", ")} · ${legA.type}@${legA.odds} / ${legB.type}@${legB.odds} · 利润 ${arbProfitRate(implied)}`,
  );

  // [A8 可证实] `lBe`：GetOrderOptions 后立即 `linkId=Date.now()`（9999 扩展再取负）
  const linkTs = Date.now();

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
    trace?.finish("fail", "无可用账号");
    return null;
  }

  if (accountA) {
    trace?.event("选号", `${legA.target} ${formatLegAccount(legA.type, accountA.playerName)}`);
  }
  if (accountB) {
    trace?.event("选号", `${legB.target} ${formatLegAccount(legB.type, accountB.playerName)}`);
  }

  const betBothLegs = Boolean(accountA) && Boolean(accountB);
  const excludeA = config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legA.target)) : [];
  const excludeB = config.noSameBet ? readUsedAccounts(bet.id, opponentSide(legB.target)) : [];
  const singleLegByRate = resolveSingleLegByRate({
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

  if (!allowArbBetExecution(betBothLegs, singleLegByRate)) {
    trace?.finish(
      "skip",
      explainAllowArbRejection({
        betBothLegs,
        singleLegByRate,
        accountA,
        accountB,
        legA,
        legB,
      }),
    );
    return null;
  }

  if (singleLegByRate) {
    trace?.event("模式", "比例 9999 单边（对侧不下单）");
  }

  return {
    legA,
    legB,
    accountA,
    accountB,
    implied,
    betBothLegs,
    singleLegByRate,
    linkId: createArbLinkId(singleLegByRate, linkTs),
  };
}
