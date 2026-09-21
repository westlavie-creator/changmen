import type { OrderRow } from "@/types/order";

const ESPORT_MARK_RE = /\b(esports?|lol|league of legends|dota\s*2?|cs:?go|cs2|counter[- ]?strike|valorant|val|kog|王者荣耀|英雄联盟|rainbow\s*six|r6)\b/i;
const FOOTBALL_LEGACY_RE = /\b(fc|cf|sc|afc|ca|aa|club|united|city|town|rovers|wanderers|juniors|central|athletic|atletico|atl[eé]tico|deportivo|rosario|argentinos)\b/i;
const FOOTBALL_TOTALS_RE = /\b(o\/u|over\/under|over\s+\d+(?:\.\d+)?|under\s+\d+(?:\.\d+)?)\b/i;

function textOf(row: OrderRow): string {
  return [row.Match, row.Bet, row.Item].map(v => String(v ?? "")).join(" ");
}

export function isFootballOrderRow(row: OrderRow): boolean {
  const domain = String(row.Domain ?? "").trim().toLowerCase();
  const sport = String(row.Sport ?? "").trim().toLowerCase();
  const game = String(row.Game ?? "").trim().toLowerCase();
  if ((domain === "sports" && sport === "football") || game === "football")
    return true;

  const type = String(row.Type ?? "").trim();
  if (type !== "Polymarket")
    return false;

  const text = textOf(row);
  if (!/\bvs\.?\b/i.test(text) || ESPORT_MARK_RE.test(text))
    return false;

  return FOOTBALL_LEGACY_RE.test(text) && FOOTBALL_TOTALS_RE.test(text);
}

export function isUnifiedFootballOrderRow(row: OrderRow): boolean {
  const type = String(row.Type ?? "").trim().toUpperCase();
  return type !== "OB" && isFootballOrderRow(row);
}
