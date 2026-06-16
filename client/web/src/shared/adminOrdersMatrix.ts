import type { AdminOrderRow } from "@/types/admin";
import { isSingleLegLink } from "@/shared/format";

export interface LinkOrderGroup {
  key: number;
  linkId: number;
  rows: AdminOrderRow[];
  createAt: number;
  betMoney: number;
  money: number;
  isLinked: boolean;
}

export interface LinkMatrixRow {
  key: number;
  linkId: number;
  createAt: number;
  betLabel: string;
  betSort: number;
  cells: Record<string, LinkOrderGroup>;
}

export interface MatchGroup {
  key: string;
  matchId: number;
  label: string;
  matchStartTime: number;
  orderCount: number;
  links: LinkMatrixRow[];
}

function normalizeBet(bet: string) {
  return String(bet || "").trim() || "—";
}

function parseBetMapSort(bet: string): number {
  const s = String(bet || "").trim();
  if (!s) return 99;
  const bracketMap = /\[地图\s*(\d+)\]/i.exec(s);
  if (bracketMap) return Number(bracketMap[1]);
  const plainMap = /地图\s*(\d+)/i.exec(s);
  if (plainMap) return Number(plainMap[1]);
  const enMap = /\bMap\s*(\d+)\b/i.exec(s);
  if (enMap) return Number(enMap[1]);
  if (/全场胜负/.test(s) || /\[全场\]/i.test(s) || /^全场\b/i.test(s)) return 0;
  return 50;
}

export function baseMatchKey(o: AdminOrderRow) {
  return o.matchKey || o.match || `o:${o.id}`;
}

/** 同 LinkID 为一组；无 link 时按行 id 单独成组 */
export function linkGroupKey(o: AdminOrderRow) {
  const linkId = Number(o.linkId) || 0;
  if (linkId !== 0) return linkId;
  return o.id;
}

function buildArbLinkIndex(orders: AdminOrderRow[]) {
  const map = new Map<number, AdminOrderRow[]>();
  for (const o of orders) {
    const linkId = Number(o.linkId) || 0;
    if (linkId <= 0 || isSingleLegLink(linkId)) continue;
    if (!map.has(linkId)) map.set(linkId, []);
    map.get(linkId)!.push(o);
  }
  return map;
}

function canonicalMatchKey(rows: AdminOrderRow[]): string {
  const withId = rows.filter((r) => (r.matchId || 0) > 0);
  if (withId.length) {
    const best = [...withId].sort((a, b) => (a.matchId || 0) - (b.matchId || 0))[0];
    return `id:${best.matchId}`;
  }
  const sorted = [...rows].sort((a, b) => a.createAt - b.createAt);
  const titles = sorted
    .map((r) => String(r.matchLabel || r.match || "").trim())
    .filter(Boolean);
  const label = titles.sort((a, b) => b.length - a.length)[0] || "";
  if (label) return `t:${label}`;
  return baseMatchKey(sorted[0]);
}

function resolveMatchKey(o: AdminOrderRow, arbIndex: Map<number, AdminOrderRow[]>) {
  const linkId = Number(o.linkId) || 0;
  if (linkId > 0 && !isSingleLegLink(linkId)) {
    const group = arbIndex.get(linkId);
    if (group?.length) return canonicalMatchKey(group);
  }
  return baseMatchKey(o);
}

function linkRowBetLabel(rows: AdminOrderRow[]) {
  const bets = [...new Set(rows.map((o) => normalizeBet(o.bet)))];
  if (bets.length <= 1) return bets[0] || "—";
  if (bets.length === 2) return bets.join(" · ");
  return `${bets[0]} · ${bets[1]} +${bets.length - 2}`;
}

export function buildLinkGroups(rows: AdminOrderRow[]): LinkOrderGroup[] {
  const map = new Map<number, AdminOrderRow[]>();
  for (const o of rows) {
    const k = linkGroupKey(o);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }
  return [...map.entries()]
    .map(([key, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => a.createAt - b.createAt);
      const linkId = sorted[0].linkId || 0;
      return {
        key,
        linkId,
        rows: sorted,
        createAt: sorted[0].createAt,
        betMoney: sorted.reduce((s, r) => s + (Number(r.betMoney) || 0), 0),
        money: sorted.reduce((s, r) => s + (Number(r.money) || 0), 0),
        isLinked: linkId !== 0 && !isSingleLegLink(linkId) && sorted.length > 1,
      };
    })
    .sort((a, b) => a.createAt - b.createAt);
}

export function buildAdminOrdersMatrix(orders: AdminOrderRow[]): {
  matchGroups: MatchGroup[];
  linkGroupTotal: number;
} {
  const list = orders ?? [];
  const arbIndex = buildArbLinkIndex(list);
  const matchBuckets = new Map<
    string,
    Map<number, Map<string, AdminOrderRow[]>>
  >();
  const matchMeta = new Map<
    string,
    { matchId: number; label: string; matchStartTime: number }
  >();

  for (const o of list) {
    const matchKey = resolveMatchKey(o, arbIndex);
    const lk = linkGroupKey(o);
    const userId = o.userId;

    if (!matchBuckets.has(matchKey)) matchBuckets.set(matchKey, new Map());
    const linkBucket = matchBuckets.get(matchKey)!;
    if (!linkBucket.has(lk)) linkBucket.set(lk, new Map());
    const userBucket = linkBucket.get(lk)!;
    if (!userBucket.has(userId)) userBucket.set(userId, []);
    userBucket.get(userId)!.push(o);

    if (!matchMeta.has(matchKey)) {
      matchMeta.set(matchKey, {
        matchId: o.matchId || 0,
        label: o.matchLabel || o.match || "—",
        matchStartTime: o.matchStartTime || 0,
      });
    }
    const meta = matchMeta.get(matchKey)!;
    if (!meta.matchId && o.matchId) meta.matchId = o.matchId;
    if (!meta.matchStartTime && o.matchStartTime) meta.matchStartTime = o.matchStartTime;
    if (meta.label === "—" && (o.matchLabel || o.match)) {
      meta.label = o.matchLabel || o.match || "—";
    }
  }

  const linkKeys = new Set<number>();
  const matchGroups: MatchGroup[] = [];

  for (const [matchKey, linkBucket] of matchBuckets) {
    const meta = matchMeta.get(matchKey)!;
    const linkRows: LinkMatrixRow[] = [];

    for (const [lk, userBucket] of linkBucket) {
      linkKeys.add(lk);
      const allRows = [...userBucket.values()].flat();
      const cells: Record<string, LinkOrderGroup> = {};
      for (const [userId, userRows] of userBucket) {
        const groups = buildLinkGroups(userRows);
        if (groups[0]) cells[userId] = groups[0];
      }
      const betLabel = linkRowBetLabel(allRows);
      linkRows.push({
        key: lk,
        linkId: allRows[0]?.linkId || 0,
        createAt: Math.min(...allRows.map((r) => r.createAt)),
        betLabel,
        betSort: parseBetMapSort(betLabel),
        cells,
      });
    }

    linkRows.sort((a, b) => a.createAt - b.createAt || a.key - b.key);

    matchGroups.push({
      key: matchKey,
      matchId: meta.matchId,
      label: meta.label,
      matchStartTime: meta.matchStartTime,
      orderCount: linkRows.length,
      links: linkRows,
    });
  }

  matchGroups.sort((a, b) => {
    if (a.matchStartTime && b.matchStartTime && a.matchStartTime !== b.matchStartTime) {
      return a.matchStartTime - b.matchStartTime;
    }
    if (a.matchId && b.matchId && a.matchId !== b.matchId) return a.matchId - b.matchId;
    return a.label.localeCompare(b.label, "zh-CN");
  });

  return { matchGroups, linkGroupTotal: linkKeys.size };
}
