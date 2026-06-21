import type { BetOption } from "@/models/betOption";
import type { UserConfig } from "@/types/userConfig";
import { useMatchStore } from "@/stores/matchStore";

/** 对齐 bundle `oJe`：用初赔算两腿胜率差，满足阈值则按 winRate 降序 */
export function sortOptionsByWinRate(
  options: BetOption[],
  config: UserConfig,
): BetOption[] | undefined {
  if (options.length !== 2)
    return undefined;

  const matchStore = useMatchStore();
  const legs = options.map((opt) => {
    const betId = opt.bet?.id ?? (Number(opt.betId) || 0);
    const odds = betId ? matchStore.getDefaultOdds(betId, opt.target) : 0;
    return { opt, odds, winRate: 0 };
  });

  if (legs.some(l => !l.odds))
    return undefined;

  const implied = 1 / legs.reduce((sum, l) => sum + 1 / l.odds, 0);
  for (const leg of legs) {
    leg.winRate = implied / leg.odds;
  }

  const diff = Math.abs(legs[0].winRate - legs[1].winRate);
  if (diff >= config.winRateValue) {
    legs.sort((a, b) => b.winRate - a.winRate);
    return legs.map(l => l.opt);
  }
  return undefined;
}
