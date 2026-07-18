/**
 * VPS MarketIndex 下发的地图胜负（以 PM 为准）；浏览器只读展示。
 */
import type {
  PolymarketMapOutcomeKind,
  PolymarketMapOutcomeSide,
  PolymarketMarketIndex,
  PolymarketMarketIndexEntry,
} from "@changmen/api-contract";
import { shallowRef } from "vue";

export type PmMapOutcomeHit = {
  mapOutcome: PolymarketMapOutcomeSide;
  outcomeKind: PolymarketMapOutcomeKind;
  homeName: string;
  awayName: string;
  map: number;
  marketId: string;
};

/** BetRow 依赖此 tick 在 Index 刷新后重算 */
export const pmMapOutcomeTick = shallowRef(0);

const byTokenId = new Map<string, PmMapOutcomeHit>();

function hitFromEntry(entry: PolymarketMarketIndexEntry): PmMapOutcomeHit | null {
  const side = entry.mapOutcome;
  if (side !== "home" && side !== "away")
    return null;
  const kind = entry.outcomeKind === "official" ? "official" : "price";
  return {
    mapOutcome: side,
    outcomeKind: kind,
    homeName: String(entry.homeName ?? ""),
    awayName: String(entry.awayName ?? ""),
    map: Number(entry.map) || 0,
    marketId: String(entry.marketId ?? ""),
  };
}

/** Index 同步后替换本地胜负表 */
export function replacePmMapOutcomesFromIndex(index: PolymarketMarketIndex | null | undefined): void {
  byTokenId.clear();
  for (const entry of index?.entries ?? []) {
    const hit = hitFromEntry(entry);
    if (!hit)
      continue;
    const home = String(entry.homeTokenId ?? "").trim();
    const away = String(entry.awayTokenId ?? "").trim();
    if (home)
      byTokenId.set(home, hit);
    if (away)
      byTokenId.set(away, hit);
  }
  pmMapOutcomeTick.value += 1;
}

export function lookupPmMapOutcomeByToken(tokenId: string | undefined | null): PmMapOutcomeHit | null {
  void pmMapOutcomeTick.value;
  const id = String(tokenId ?? "").trim();
  if (!id)
    return null;
  return byTokenId.get(id) ?? null;
}

/** 展示用胜方队名：优先盘口 home/away 名，否则 Index 名 */
export function pmMapOutcomeWinnerLabel(
  hit: PmMapOutcomeHit,
  betHomeName?: string,
  betAwayName?: string,
): string {
  if (hit.mapOutcome === "home")
    return String(betHomeName || hit.homeName || "主队").trim() || "主队";
  return String(betAwayName || hit.awayName || "客队").trim() || "客队";
}
