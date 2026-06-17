import type { ViewBetItem, ViewMatch } from "@/models/match";

/** 下单前用当前列表的 providers 刷新平台 matchId，避免 item 内嵌 id 过期指到别场 */
export function syncBetItemProviderMatchId(match: ViewMatch, item: ViewBetItem): boolean {
  const providerMatchId = String(match.providers[item.type] ?? "");
  if (!providerMatchId) return false;
  item.matchId = providerMatchId;
  return true;
}
