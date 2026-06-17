import { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { pickArbLegs } from "@/domain/arbitrage";
import { sortOptionsByWinRate } from "@/shared/winRate";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";

/** 对齐 A8 `IQ.GetOrderOptions`：选腿 + 对冲金额 + betSorting */
export function buildOrderOptions(
  bet: ViewBet,
  match: ViewMatch,
  config: UserConfig,
  accounts: PlatformAccount[] = [],
  /** 对齐 A8 `Io().getProviders()` 的 keys */
  providerKeys: PlatformId[],
): BetOption[] | undefined {
  const legs = pickArbLegs(bet, config, providerKeys, accounts, match.game);
  if (!legs) return undefined;

  const { homeItem, awayItem, homeOdds, awayOdds } = legs;
  const betMoney = config.betMoney;
  const low = Math.min(homeOdds, awayOdds);
  const high = Math.max(homeOdds, awayOdds);
  let hedgeMoney = (low * betMoney) / high;
  if (config.tenNumber) hedgeMoney = Math.round(hedgeMoney / 10) * 10;

  const options: BetOption[] =
    homeOdds < awayOdds
      ? [
          new BetOption(match, bet, homeItem, "Home", betMoney),
          new BetOption(match, bet, awayItem, "Away", hedgeMoney),
        ]
      : [
          new BetOption(match, bet, awayItem, "Away", betMoney),
          new BetOption(match, bet, homeItem, "Home", hedgeMoney),
        ];

  switch (config.betSorting) {
    case "Low":
      options.sort((a, b) => (a.odds < b.odds ? -1 : 1));
      break;
    case "High":
      options.sort((a, b) => (a.odds > b.odds ? -1 : 1));
      break;
    case "Parallel":
      break;
    case "WinRate": {
      const byWinRate = sortOptionsByWinRate(options, config);
      if (byWinRate) {
        options.splice(0, options.length, ...byWinRate);
      } else {
        options.sort(
          (a, b) =>
            config.providerSortValue.indexOf(a.type) -
            config.providerSortValue.indexOf(b.type),
        );
      }
      break;
    }
    case "Custom":
      options.sort(
        (a, b) =>
          config.providerSortValue.indexOf(a.type) - config.providerSortValue.indexOf(b.type),
      );
      break;
    default:
      options.sort(
        (a, b) =>
          config.providerSortValue.indexOf(a.type) - config.providerSortValue.indexOf(b.type),
      );
  }

  if (options.some((o) => config.providerFixed.includes(o.type))) {
    options.sort(
      (a, b) => config.providerFixed.indexOf(b.type) - config.providerFixed.indexOf(a.type),
    );
  }

  return options;
}
