/**
 * AutoYabo 比价：在精确盘报价上叠 EV 上限（spike）。
 */
import {
  comparePodObQuote,
  type PodMarketMatch,
  type PodObQuoteCompare,
} from "@/runtime/podMarketMatch";

export function comparePodYaboQuote(
  match: PodMarketMatch,
  minObOdds: number,
  opts: { maxObOdds?: number; nvp?: number } = {},
): PodObQuoteCompare {
  return comparePodObQuote(match, minObOdds, opts);
}
