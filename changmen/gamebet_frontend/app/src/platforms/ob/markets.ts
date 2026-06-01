
import { directGet } from "@/shared/http";
import { num, obBlockLabel, obOddSide, parseObOddField } from "./parse";
import type { CollectBetDto } from "@/types/collect";
import type { ViewMatch } from "@/models/match";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";

const PLATFORM = PLATFORMS.OB;
const STAGE_VIEW_INTERVAL_MS = 1500;

/** 轮询 game/index：与 backend stageIdsForBo 一致（BO1 仅全场） */
export function maxStageFromBo(bo: unknown): number {
  const n = num(bo);
  return n <= 1 ? 0 : n;
}

export function teamNamesFromViewMatch(match: ViewMatch): [string, string] {
  const row = match.bets[0];
  if (row?.homeName && row?.awayName) return [row.homeName, row.awayName];
  const parts = match.title.split(/\s+vs\s+/i);
  return [parts[0]?.trim() ?? "", parts[1]?.trim() ?? ""];
}

/** GetMatchs 已有盘口 round → game/view 的 stage_id 上限 */
export function maxStageFromViewMatch(match: ViewMatch): number {
  if (!match.bets.length) return 0;
  return Math.max(0, ...match.bets.map((b) => b.round));
}

/** 拉盘 stage 上限：不能只看当前 Bets（过滤组合盘后可能只剩全场） */
export function maxStageForObLoad(match: ViewMatch): number {
  const fromBets = maxStageFromViewMatch(match);
  const fromBo = match.bo != null && match.bo > 0 ? maxStageFromBo(match.bo) : 0;
  return Math.max(fromBets, fromBo);
}

function findObMainOddsSides(entries: Array<Record<string, unknown>>): {
  home?: Record<string, unknown>;
  away?: Record<string, unknown>;
} {
  let home: Record<string, unknown> | undefined;
  let away: Record<string, unknown> | undefined;
  for (const p of entries) {
    if (p.name === "@T1") home = p;
    else if (p.name === "@T2") away = p;
    if (home && away) break;
  }
  return { home, away };
}

/** A8 UMe：单 block 是否进入 saveBets / fo */
function obBlockCollectable(block: Record<string, unknown>, label: string, betRe: RegExp): boolean {
  if (block.status === 12 || block.visible === 0) return false;
  return betRe.test(label);
}

/** 单场各 stage 拉 game/view，写入 fo 并返回 SaveBet 载荷（对齐 A8：每 stage 可多盘口） */
export async function loadMarketsForMatch(
  platform: CollectPlatformInfo,
  matchId: string,
  maxStage: number,
  betRe: RegExp,
  teamNames: [string, string],
): Promise<{ bets: CollectBetDto[]; hadError: boolean }> {
  const odds = useOddsStore();
  const bets: CollectBetDto[] = [];
  let hadError = false;
  for (let stage = 0; stage <= maxStage; stage += 1) {
    try {
      const view = await collectObGet<{ status: string; data?: Array<Record<string, unknown>> }>(
        platform,
        "game/view",
        `match_id=${matchId}&stage_id=${stage}`,
      );
      if (view.status !== "true" || !Array.isArray(view.data)) continue;

      for (const block of view.data) {
        const label = obBlockLabel(block);
        if (!obBlockCollectable(block, label, betRe)) continue;

        const locked =
          block.status !== 6 || block.visible !== 1 || block.suspended !== 0;
        const oddsMap = (block.odds ?? {}) as Record<string, Record<string, unknown>>;
        const entries = Object.values(oddsMap);
        for (const p of entries) {
          const parsed = parseObOddField(p);
          odds.save(
            PLATFORM,
            {
              id: String(p.id),
              odds: parsed,
              isLock: locked,
              betId: String(block.id),
              side: obOddSide(p.name),
              time: Date.now(),
            },
            "http",
          );
        }
        const { home, away } = findObMainOddsSides(entries);
        if (!home || !away) continue;

        const round = num(block.round);
        bets.push({
          Type: PLATFORM,
          SourceMatchID: matchId,
          Map: round,
          SourceBetID: String(block.id),
          OddTypeID: String(block.odd_type_id ?? ""),
          BetName: label,
          SourceHomeID: String(home.id),
          HomeName: teamNames[0] ?? "",
          HomeOdds: parseObOddField(home),
          SourceAwayID: String(away.id),
          AwayName: teamNames[1] ?? "",
          AwayOdds: parseObOddField(away),
          Status: locked ? "Locked" : "Normal",
        });
      }
    } catch (err) {
      hadError = true;
      console.error("[OB] game/view error", matchId, stage, err);
    } finally {
      await wait(STAGE_VIEW_INTERVAL_MS);
    }
  }

  return { bets, hadError };
}

/** 灌 fo + 落库（GetMatchs / 订阅刷新共用） */
export async function refreshObMatchMarkets(
  platform: CollectPlatformInfo,
  sourceMatchId: string,
  match: ViewMatch,
  betRe: RegExp,
): Promise<void> {
  const collect = useCollectStore();
  const loaded = await loadMarketsForMatch(
    platform,
    sourceMatchId,
    maxStageForObLoad(match),
    betRe,
    teamNamesFromViewMatch(match),
  );
  if (loaded.bets.length && !loaded.hadError) {
    await collect.saveBets(PLATFORM, sourceMatchId, loaded.bets);
  }
}

/** 对齐 A8 Ck(platform) */
function obHeaders(token: string): Record<string, string> {
  return { device: "1", lang: "cn", token, Accept: "application/json, text/plain, */*" };
}

/** A8 NMe：Rr.get(Nr) 直连 OB gateway */
export async function collectObGet<T>(
  platform: CollectPlatformInfo,
  path: string,
  query = "",
): Promise<T> {
  if (!platform.Gateway || !platform.Token) throw new Error("OB collect platform not configured");
  const base = platform.Gateway.replace(/\/+$/, "");
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const q = query ? (apiPath.includes("?") ? "&" : "?") + query : "";
  return directGet<T>(`${base}${apiPath}${q}`, obHeaders(platform.Token));
}

