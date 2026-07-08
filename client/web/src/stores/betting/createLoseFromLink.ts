import type { ViewBet, ViewMatch } from "@/models/match";
import type { OrderRow } from "@/types/order";
import { isMakeupSyntheticOrderRow } from "@/shared/orderLink";

function stripHtml(html: string): string {
  return String(html ?? "").replace(/<[^>]*>/g, "").trim();
}

/** 从 Link 组内真实订单行反查当前赛事列表中的 match + bet */
export function resolveMatchBetForOrderRows(
  matches: ViewMatch[],
  rows: OrderRow[],
): { match: ViewMatch; bet: ViewBet } | undefined {
  const sample = rows.find(r => !isMakeupSyntheticOrderRow(r));
  if (!sample)
    return undefined;
  const matchText = stripHtml(sample.Match ?? "");
  const betText = stripHtml(sample.Bet ?? "");
  if (!matchText || !betText)
    return undefined;
  for (const match of matches) {
    if (stripHtml(match.title) !== matchText)
      continue;
    for (const bet of match.bets) {
      if (stripHtml(bet.getBetName()) === betText)
        return { match, bet };
    }
  }
  return undefined;
}
