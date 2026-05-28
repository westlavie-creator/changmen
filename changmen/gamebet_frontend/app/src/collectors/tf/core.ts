import { a8StartTimeCollectAllowed } from "@/utils/a8MatchTime";

/** 与 gamebet_backend/shared/market_catalog.json → TF.match_winner 一致 */
export const TF_DEFAULT_BET_NAME = "(独赢|获胜者)";

export const TF_POLL_MS = 30_000;
export const TF_STAGE_WAIT_MS = 1000;

export function parseTfStartTimeMs(raw: unknown): number {
  if (!raw) return 0;
  const ms = Date.parse(String(raw).replace(" ", "T"));
  return Number.isNaN(ms) ? 0 : ms;
}

/** A8 NBe 列表过滤：game_id ∈ games 且 start < now + 3600s */
export function tfListEventCollectAllowed(row: Record<string, unknown>): boolean {
  return a8StartTimeCollectAllowed(parseTfStartTimeMs(row.start_datetime));
}

export function compileTfBetNameRegex(platformBetName?: string): RegExp {
  const pat = platformBetName?.trim() || TF_DEFAULT_BET_NAME;
  return new RegExp(pat);
}

export function parseBo(raw: unknown): number {
  const m = String(raw ?? "").match(/BO(\d+)/i);
  return m ? Number(m[1]) || 0 : 0;
}

export function stageFromTabName(
  tabName: string,
): { stageId: number; mapOption: string; marketOption: "MATCH" | "MAP" } | null {
  const name = tabName.trim();
  if (!name || name === "MATCH") return { stageId: 0, mapOption: "", marketOption: "MATCH" };
  const mapMatch = /^MAP\s*(\d+)$/i.exec(name);
  if (mapMatch) {
    const n = Number(mapMatch[1]);
    return { stageId: n, mapOption: name, marketOption: "MAP" };
  }
  // A8：非 MATCH 的 tab 一律按 MAP + map_option=tab 名请求
  return { stageId: 0, mapOption: name, marketOption: "MAP" };
}

/** A8 在 MATCH 详情响应的 market_tabs 中发现地图 tab（不用列表行上的 tabs） */
export function extractMapTabsFromResults(results: Array<Record<string, unknown>>): string[] {
  const tabs: string[] = [];
  for (const block of results) {
    const marketTabs = (block.market_tabs ?? []) as Array<{ tab_name?: string }>;
    for (const t of marketTabs) {
      const name = String(t.tab_name ?? "").trim();
      if (name && name !== "MATCH" && !tabs.includes(name)) tabs.push(name);
    }
  }
  return tabs;
}

export function selectionOddsId(marketId: string, selectionName: string): string {
  return `${marketId}:${selectionName}`;
}

export function pickSelection(
  market: Record<string, unknown>,
  side: string,
): Record<string, unknown> | undefined {
  const rows = (market.selection ?? []) as Array<Record<string, unknown>>;
  return rows.find((s) => s.name === side);
}

export function marketLocked(
  market: Record<string, unknown>,
  home: Record<string, unknown>,
  away: Record<string, unknown>,
): boolean {
  if (home.status !== "open" || away.status !== "open") return true;
  if (market.settlement_status === "settled") return true;
  return false;
}
