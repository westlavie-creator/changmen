import { buildAccumulateRow } from "@changmen/match-engine";
import { formatOdds } from "@changmen/shared/odds_format";
import { reprojectClientMatchList } from "./project_side_sources.js";

export function sourceFromBet(provider, b) {
  return {
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: formatOdds(b.HomeOdds),
    AwayOdds: formatOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  };
}

/**
 * 在旧 merge 产出的 list 上强制重投影主客（覆盖旧 reconcile 结果）。
 */
export function reprojectMergedList(info, {
  matches,
  bets,
  timers,
  existingClientRows,
  platformOverrides = {},
  forceReanchorOrientation = false,
  stickyOrientation,
} = {}) {
  return reprojectClientMatchList(info, {
    matches,
    bets,
    timers,
    sourceFromBet,
    buildAccumulateRow,
    existingClientRows,
    platformOverrides,
    forceReanchorOrientation,
    stickyOrientation,
  });
}
