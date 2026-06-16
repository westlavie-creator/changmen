import { BetOption, opponentSide } from "@/models/betOption";
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbLegs } from "@/domain/arbitrage/pickArbLegs";
import { pickArbLegs } from "@/domain/arbitrage/pickArbLegs";
import { buildOrderOptions } from "@/domain/betting/buildOrderOptions";
import {
  accountPassesMainBetFilter,
  explainMainBetAccountRejection,
  type BetFilterMatchContext,
} from "@/stores/betting/betFilters";
import { readUsedAccounts } from "@/stores/betting/successMarkers";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { allowArbBetExecution, resolveRate9999SingleLeg } from "@/extensions/arbBet/rate9999";

export interface ArbOrderEligibility {
  canOrder: boolean;
  reasons: string[];
  summary: string;
}

export interface ArbOrderEligibilityContext {
  match: ViewMatch;
  bet: ViewBet;
  legs: ArbLegs;
  config: UserConfig;
  accounts: PlatformAccount[];
  autoProviderKeys: PlatformId[];
  loseOrderPending: boolean;
  getBetTarget: (provider: PlatformId, betId: number) => BetSide | undefined;
}

function collectLegAccountReasons(
  accounts: PlatformAccount[],
  provider: PlatformId,
  betMoney: number,
  excludeAccountIds: number[],
  explain: (acc: PlatformAccount) => string | null,
): string[] {
  const providerAccounts = accounts.filter((a) => a.provider === provider);
  if (!providerAccounts.length) {
    return [`无 ${provider} 平台账号`];
  }

  const reasons = new Set<string>();
  let excludedByNoSame = 0;

  for (const acc of providerAccounts) {
    if (excludeAccountIds.includes(acc.accountId)) {
      excludedByNoSame++;
      continue;
    }
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder) {
      reasons.add("已达单日订单上限");
      continue;
    }
    const bal = acc.getBalance();
    if (bal === undefined) {
      reasons.add("余额未加载");
      continue;
    }
    if (bal < betMoney) {
      reasons.add(`余额 ${bal} 低于所需 ${betMoney}`);
      continue;
    }
    const rejection = explain(acc);
    if (rejection) reasons.add(rejection);
  }

  if (reasons.size) return [...reasons];
  if (excludedByNoSame > 0) {
    return ["场管不对打：该边可用账号已被占用"];
  }
  return [`${provider} 账号不可用`];
}

function findMainBetAccount(
  accounts: PlatformAccount[],
  leg: BetOption,
  betMoney: number,
  excludeAccountIds: number[],
  filter: (acc: PlatformAccount) => boolean,
): PlatformAccount | undefined {
  return accounts.find((acc) => {
    if (excludeAccountIds.includes(acc.accountId)) return false;
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder) return false;
    const bal = acc.getBalance();
    if (bal === undefined) return false;
    if (filter && !filter(acc)) return false;
    return acc.provider === leg.type && bal >= betMoney;
  });
}

function missingPlatformsForLegs(
  legs: ArbLegs,
  autoProviderKeys: PlatformId[],
): PlatformId[] {
  const need = new Set<PlatformId>([legs.homeItem.type, legs.awayItem.type]);
  const have = new Set(autoProviderKeys);
  return [...need].filter((p) => !have.has(p));
}

/** Telegram 套利提醒：评估 display 腿是否可走自动下单路径（含 rate9999 单边） */
export function evaluateArbOrderEligibility(
  ctx: ArbOrderEligibilityContext,
): ArbOrderEligibility {
  const { match, bet, legs, config, accounts, autoProviderKeys, loseOrderPending } = ctx;
  const reasons: string[] = [];

  if (!config.betting) {
    reasons.push("自动投注未开启（参数配置 → 开启投注）");
  }
  if (loseOrderPending) {
    reasons.push("该盘口已在补单队列，自动套利已跳过");
  }
  if (!autoProviderKeys.length) {
    reasons.push(`无余额 ≥ ${config.betMoney} 的在线账号`);
  } else if (autoProviderKeys.length === 1) {
    reasons.push(
      `仅 ${autoProviderKeys[0]} 有余额账号，套利需至少两个不同平台各有一腿`,
    );
  }

  const missing = missingPlatformsForLegs(legs, autoProviderKeys);
  for (const p of missing) {
    reasons.push(`缺少 ${p} 平台账号或余额不足 ${config.betMoney}`);
  }

  const autoLegs = pickArbLegs(bet, config, autoProviderKeys, accounts, match.game);
  if (!autoLegs && autoProviderKeys.length >= 2 && !missing.length) {
    reasons.push("有余额平台组合无法满足当前利润/赔率阈值");
  }

  const options = buildOrderOptions(bet, match, config, autoProviderKeys, accounts);
  if (!options || options.length !== 2) {
    if (!reasons.some((r) => r.includes("平台") || r.includes("余额"))) {
      reasons.push("无法构建双腿对冲订单");
    }
    return finalize(false, reasons);
  }

  const legA = options[0];
  const legB = options[1];
  const implied = 1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);

  const matchStoreShim: BetFilterMatchContext = { getBetTarget: ctx.getBetTarget };

  const excludeA = config.noSameBet
    ? readUsedAccounts(bet.id, opponentSide(legA.target))
    : [];
  const excludeB = config.noSameBet
    ? readUsedAccounts(bet.id, opponentSide(legB.target))
    : [];

  const filterA = (acc: PlatformAccount) =>
    accountPassesMainBetFilter(acc, bet, match, legA, matchStoreShim, implied);
  const filterB = (acc: PlatformAccount) =>
    accountPassesMainBetFilter(acc, bet, match, legB, matchStoreShim, implied);

  const accountA = findMainBetAccount(accounts, legA, legA.betMoney, excludeA, filterA);
  const accountB = findMainBetAccount(accounts, legB, legB.betMoney, excludeB, filterB);

  if (!accountA) {
    const legLabel = `${legA.type} ${legA.target === "Home" ? "主" : "客"} ${legA.odds}`;
    for (const r of collectLegAccountReasons(
      accounts,
      legA.type,
      legA.betMoney,
      excludeA,
      (acc) => explainMainBetAccountRejection(acc, bet, match, legA, matchStoreShim, implied),
    )) {
      reasons.push(`${legLabel}：${r}`);
    }
  }
  if (!accountB) {
    const legLabel = `${legB.type} ${legB.target === "Home" ? "主" : "客"} ${legB.odds}`;
    for (const r of collectLegAccountReasons(
      accounts,
      legB.type,
      legB.betMoney,
      excludeB,
      (acc) => explainMainBetAccountRejection(acc, bet, match, legB, matchStoreShim, implied),
    )) {
      reasons.push(`${legLabel}：${r}`);
    }
  }

  const betBothLegs = Boolean(accountA) && Boolean(accountB);
  const rate9999SingleLeg = resolveRate9999SingleLeg({
    betBothLegs,
    accountA,
    accountB,
    legA,
    legB,
    bet,
    match,
    accounts,
    excludeA,
    excludeB,
    matchStore: matchStoreShim,
    implied,
  });

  if (!allowArbBetExecution(betBothLegs, rate9999SingleLeg) && (accountA || accountB)) {
    reasons.push("仅一侧有可用账号，且非比例 9999 单边模式");
  }

  const canOrder =
    config.betting &&
    !loseOrderPending &&
    allowArbBetExecution(betBothLegs, rate9999SingleLeg);

  return finalize(canOrder, dedupeReasons(reasons), rate9999SingleLeg && !betBothLegs);
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function finalize(
  canOrder: boolean,
  reasons: string[],
  singleLegOnly = false,
): ArbOrderEligibility {
  if (canOrder) {
    const summary = singleLegOnly ? "可下单（单边）" : "可下单";
    return {
      canOrder: true,
      reasons: ["通过账号筛选；场馆封盘/限红/赔率变更仍可能在下单时拦截"],
      summary,
    };
  }
  const filtered = reasons.filter((r) => !r.includes("场馆封盘"));
  const summary =
    filtered.length === 1
      ? `不可下单：${filtered[0]}`
      : `不可下单（${filtered.length} 项）`;
  return {
    canOrder: false,
    reasons: filtered.length ? filtered : ["未知原因"],
    summary,
  };
}
