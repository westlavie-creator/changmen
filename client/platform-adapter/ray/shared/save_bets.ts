import { rayMatchStage } from "./match_stage";

export interface RayOddsPayload {
  id?: string | number;
  team?: Array<{ pos: number; team_id: string | number; team_name?: string }>;
  odds?: Array<Record<string, unknown>>;
}

export interface RaySaveBetRow {
  Type: string;
  SourceMatchID: string | number;
  SourceBetID: string;
  Map: number;
  BetName: string;
  SourceHomeID: string;
  HomeName: string;
  HomeOdds: number;
  SourceAwayID: string;
  AwayName: string;
  AwayOdds: number;
  Status: string;
}

export interface RayFoOddEntry {
  id: string;
  odds: number;
  isLock: boolean;
  betId: string;
  side?: "home" | "away";
}

/** A8 vQe：单条 odds 是否进入 fo / SaveBet（status=4 为删盘；BetName 正则过滤） */
export function isRayOddCollectable(p: Record<string, unknown>, betRe: RegExp): boolean {
  const group = String(p.group_name ?? "");
  return p.status !== 4 && betRe.test(group);
}

/** odds API 单行 → fo 写入条目 */
export function rayFoOddEntry(
  p: Record<string, unknown>,
  homeTeamId: string | number,
  awayTeamId: string | number,
): RayFoOddEntry {
  const isHome = String(p.team_id) === String(homeTeamId);
  const isAway = String(p.team_id) === String(awayTeamId);
  return {
    id: String(p.odds_id ?? ""),
    odds: Number(p.odds) || 0,
    isLock: p.status !== 1,
    betId: String(p.odds_group_id ?? ""),
    side: isHome ? "home" : isAway ? "away" : undefined,
  };
}

/** Ingest：可采集 odds 行 → fo 条目列表 */
export function listRayFoOddEntries(
  result: RayOddsPayload,
  betRe: RegExp,
): RayFoOddEntry[] {
  const teams = result?.team ?? [];
  const homeTeam = teams.find((t) => t.pos === 1);
  const awayTeam = teams.find((t) => t.pos === 2);
  if (!homeTeam || !awayTeam) return [];

  const entries: RayFoOddEntry[] = [];
  for (const p of result?.odds ?? []) {
    if (!isRayOddCollectable(p, betRe)) continue;
    entries.push(rayFoOddEntry(p, homeTeam.team_id, awayTeam.team_id));
  }
  return entries;
}

/** Report：RAY v2/odds → A8 SaveBet 行（对齐 vQe `o`：按 SourceBetID===odds_group_id 合并） */
export function groupRayOddsToSaveBets(
  result: RayOddsPayload,
  betRe: RegExp,
  platform = "RAY",
): RaySaveBetRow[] {
  const teams = result?.team ?? [];
  const homeTeam = teams.find((t) => t.pos === 1);
  const awayTeam = teams.find((t) => t.pos === 2);
  if (!homeTeam || !awayTeam) return [];

  const rows: RaySaveBetRow[] = [];
  for (const p of result?.odds ?? []) {
    if (!isRayOddCollectable(p, betRe)) continue;

    const group = String(p.group_name ?? "");
    const oddsId = String(p.odds_id ?? "");
    const groupId = String(p.odds_group_id ?? "");
    const stage = rayMatchStage(p.match_stage);
    const prefix = stage === 0 ? "[全场]" : `[地图${stage}]`;

    const isHome = String(p.team_id) === String(homeTeam.team_id);
    const isAway = String(p.team_id) === String(awayTeam.team_id);

    let row = rows.find((v) => v.SourceBetID === groupId);
    if (row) {
      if (isHome) {
        row.SourceHomeID = oddsId;
        row.HomeName = String(p.name ?? "");
        row.HomeOdds = Number(p.odds) || 0;
      } else if (isAway) {
        row.SourceAwayID = oddsId;
        row.AwayName = String(p.name ?? "");
        row.AwayOdds = Number(p.odds) || 0;
      }
      continue;
    }

    rows.push({
      Type: platform,
      SourceMatchID: result.id ?? "",
      SourceBetID: groupId,
      Map: stage,
      BetName: `${prefix} ${group}`,
      SourceHomeID: isHome ? oddsId : "",
      HomeName: isHome ? String(p.name ?? "") : "",
      HomeOdds: isHome ? Number(p.odds) || 0 : 0,
      SourceAwayID: isAway ? oddsId : "",
      AwayName: isAway ? String(p.name ?? "") : "",
      AwayOdds: isAway ? Number(p.odds) || 0 : 0,
      Status: p.status === 1 ? "Normal" : "Locked",
    });
  }

  return rows.sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}
