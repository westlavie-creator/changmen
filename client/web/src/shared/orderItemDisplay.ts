/** 从「主队 vs 客队」对阵文案解析两侧队名 */
export function parseMatchHomeAway(
  match: string | null | undefined,
): { home: string; away: string } | null {
  let raw = String(match || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw)
    return null;
  raw = raw.replace(
    /^(lol|league of legends|dota\s*2?|cs:?go|cs2|counter[- ]?strike|valorant|val|kog|王者荣耀|英雄联盟)\s*[:：\-–—]\s*/i,
    "",
  );
  // 兼容 `A vs B` / `A - VS - B` / `A v B`
  const parts = raw.split(/\s*[-–—]?\s*vs\.?\s*[-–—]?\s*|\s+v\.?\s+/i);
  if (parts.length !== 2)
    return null;
  const clean = (s: string) => s
    .replace(/\s*[-–—]\s*(game|map|地图)\s*\d+\b.*$/i, "")
    .replace(/\s*[-–—]\s*.*\b(winner|获胜|胜负)\b.*$/i, "")
    .replace(/^[-–—\s]+|[-–—\s]+$/g, "")
    .trim();
  const home = clean(parts[0] ?? "");
  const away = clean(parts[1] ?? "");
  if (!home || !away)
    return null;
  return { home, away };
}

/**
 * 展示用选项：把落库的 Home/Away（及「平仓 Home」）解析成队名。
 * 队名已是明文时原样返回。
 */
export function resolveOrderItemLabel(
  item: string | null | undefined,
  match: string | null | undefined,
): string {
  const raw = String(item ?? "").trim();
  if (!raw)
    return "";
  const sides = parseMatchHomeAway(match);
  if (!sides)
    return raw;

  const sell = raw.match(/^(平仓)\s+(.+)$/i);
  const prefix = sell ? `${sell[1]} ` : "";
  const core = (sell ? sell[2] : raw).trim();
  const key = core.toLowerCase();
  if (key === "home" || core === "主队")
    return `${prefix}${sides.home}`;
  if (key === "away" || core === "客队")
    return `${prefix}${sides.away}`;
  return raw;
}
