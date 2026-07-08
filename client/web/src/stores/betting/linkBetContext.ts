/** [changmen 扩展] 套利 linkId → matchId/betId，供侧栏表头双击补单（对齐 BetRow 直接拿对象） */

const STORAGE_KEY = "LINK_BET_CTX";

export interface LinkBetContext {
  matchId: number;
  betId: number;
}

function readAll(): Record<string, LinkBetContext> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw)
      return {};
    const parsed = JSON.parse(raw) as Record<string, LinkBetContext>;
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  catch {
    return {};
  }
}

function writeAll(map: Record<string, LinkBetContext>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function saveLinkBetContext(linkId: number, matchId: number, betId: number) {
  const link = Number(linkId) || 0;
  const mid = Number(matchId) || 0;
  const bid = Number(betId) || 0;
  if (!link || !mid || !bid)
    return;
  const map = readAll();
  map[String(link)] = { matchId: mid, betId: bid };
  writeAll(map);
}

export function loadLinkBetContext(linkId: number): LinkBetContext | undefined {
  const link = Number(linkId) || 0;
  if (!link)
    return undefined;
  const row = readAll()[String(link)];
  if (!row)
    return undefined;
  const matchId = Number(row.matchId) || 0;
  const betId = Number(row.betId) || 0;
  if (!matchId || !betId)
    return undefined;
  return { matchId, betId };
}
