import type { BetSide, ViewBet, ViewBetItem } from "@/models/match";
import { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";

/** 套利检测选出的两腿（与 A8 `GetOrderOptions` 选腿逻辑一致，不含下注排序） */
export interface ArbLegs {
  homeItem: ViewBetItem;
  awayItem: ViewBetItem;
  homeOdds: number;
  awayOdds: number;
  implied: number;
}

/**
 * 检测是否满足套利阈值（profit～maxProfit、minOdds、平台过滤等）。
 * UI 检测与自动下注共用；是否实际下单由 `config.betting` 控制。
 */
export function pickArbLegs(
  bet: ViewBet,
  config: UserConfig,
  providerKeys: PlatformId[],
  accounts: PlatformAccount[] = [],
  gameName?: string,
): ArbLegs | undefined {
  if (!config) return undefined;

  const allowSame = new Set(config.allowSameBet ?? []);

  const homeCandidates = bet.items.filter((v) => {
    if (
      config.noSameBet &&
      !allowSame.has(v.type) &&
      bet.isBetExcludedByNoSameRule(v.type, "Away")
    ) {
      return false;
    }
    const homeOdds = v.getOdds("Home");
    if (config.maxOdds && homeOdds > config.maxOdds) return false;
    return homeOdds >= config.minOdds && homeOdds > 0 && providerKeys.includes(v.type);
  });
  const homeItem = homeCandidates.reduce<ViewBetItem | undefined>((best, cur) => {
    const odds = cur.getOdds("Home");
    if (!best || odds > best.getOdds("Home")) return cur;
    return best;
  }, undefined);

  const awayCandidates = bet.items.filter((v) => {
    if (homeItem && homeItem.type === v.type) return false;
    if (
      config.noSameBet &&
      !allowSame.has(v.type) &&
      bet.isBetExcludedByNoSameRule(v.type, "Away")
    ) {
      return false;
    }
    const awayOdds = v.getOdds("Away");
    if (config.maxOdds && awayOdds > config.maxOdds) return false;
    return awayOdds >= config.minOdds && awayOdds > 0 && providerKeys.includes(v.type);
  });
  const awayItem = awayCandidates.reduce<ViewBetItem | undefined>((best, cur) => {
    const odds = cur.getOdds("Away");
    if (!best || odds > best.getOdds("Away")) return cur;
    return best;
  }, undefined);

  if (!homeItem || !awayItem) return undefined;

  const homeOdds = homeItem.getOdds("Home");
  const awayOdds = awayItem.getOdds("Away");
  const implied = 1 / (1 / homeOdds + 1 / awayOdds);

  let targetProfit = config.profit;
  const profitOverrides = accounts.filter(
    (a) =>
      (a.profit !== 0 || !!(gameName && a.game?.[gameName]?.profit)) &&
      (a.provider === homeItem.type || a.provider === awayItem.type),
  );
  if (profitOverrides.length) {
    targetProfit = Math.max(
      ...profitOverrides.map((a) =>
        PlatformAccount.profitFloorForGame(a, gameName, config.profit),
      ),
    );
  }
  if (implied < targetProfit || implied > config.maxProfit) return undefined;

  return { homeItem, awayItem, homeOdds, awayOdds, implied };
}

export function arbLegSide(
  legs: ArbLegs | undefined,
  item: ViewBetItem,
  side: BetSide,
): boolean {
  if (!legs) return false;
  if (side === "Home") return legs.homeItem.type === item.type;
  return legs.awayItem.type === item.type;
}
