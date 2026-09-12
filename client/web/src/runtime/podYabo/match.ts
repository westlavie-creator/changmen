/**
 * 副盘：主档未对上时，用该书自己的 NVP 去对 ±0.25 邻档。
 * 不对盘本身仍走 podMarketMatch 的精确线。
 */
import type { PodBookLine, PodDropAlert } from "@/runtime/podAlerts";
import { podAlertLineKind } from "@/runtime/podBetSettings";
import type { PodBoardFixture } from "@/runtime/podFixtureMatch";
import {
  matchPodAlertToMarket,
  type PodLiveOddsReader,
  type PodMarketMatch,
  type PodMarketSide,
} from "@/runtime/podMarketMatch";
import { listPodBookNeighbors } from "./book";

export type PodYaboMatchOpts = {
  books?: PodBookLine[];
  loose?: boolean;
};

function neighborSide(side: PodMarketSide | null): "over" | "under" | "home" | "away" | null {
  if (side === "over" || side === "under" || side === "home" || side === "away")
    return side;
  return null;
}

export function matchPodYaboMarket(
  alert: PodDropAlert,
  fixture?: Pick<PodBoardFixture, "markets"> | null,
  swapped = false,
  live?: PodLiveOddsReader,
  opts?: PodYaboMatchOpts,
): PodMarketMatch {
  const exact = matchPodAlertToMarket(alert, fixture, swapped, live);
  if (exact.status === "matched" || opts?.loose !== true)
    return exact;
  const kind = podAlertLineKind(alert);
  if (kind !== "totals" && kind !== "spreads")
    return exact;
  const side = neighborSide(exact.side);
  const points = Number(alert.points);
  if (!side || !Number.isFinite(points))
    return exact;
  const neighbors = listPodBookNeighbors(opts.books, {
    eventId: String(alert.eventId || "").trim(),
    period: Number(alert.period) || 0,
    market: kind,
    side,
    line: points,
  });
  for (const cand of neighbors) {
    const hit = matchPodAlertToMarket({ ...alert, points: cand.line }, fixture, swapped, live);
    if (hit.status === "matched")
      return { ...hit, loose: true, nvp: cand.nvp > 1 ? cand.nvp : 0 };
  }
  return exact;
}
