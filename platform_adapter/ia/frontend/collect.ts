import { getCollectPlatform, getGames } from "@/api/esport";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { handleIaRealtimeMessage } from "./messages";
import { createIaRealtimeClient, type IaRealtimeClient } from "./realtime";

const PLATFORM = PLATFORMS.IA;
const POLL_MS = 30_000;

function parseStartTime(raw: unknown): number {
  if (!raw) return Date.now();
  if (typeof raw === "number") return raw > 1e12 ? raw : raw * 1000;
  const ms = Date.parse(String(raw).replace(" ", "T"));
  return Number.isNaN(ms) ? Date.now() : ms;
}

function betKeyFromChild(child: Record<string, unknown>): string {
  const map = child.match;
  const prefix = map !== 0 && map != null ? `[地图${map}]` : "[全场]";
  return `${prefix}${child.name ?? ""}`;
}

function pickIaTeamId(row: Record<string, unknown>, side: "home" | "away"): string {
  const raw =
    side === "home"
      ? row.team_id_1 ?? row.team_a_id ?? row.home_id ?? row.home_team_id
      : row.team_id_2 ?? row.team_b_id ?? row.away_id ?? row.away_team_id;
  if (raw == null) return "";
  return String(raw).trim();
}

/** A8 CQe：IA GET — 经后端代理转发（IA 源站不返回 CORS 头） */
async function collectIaGet<T>(platform: CollectPlatformInfo, path: string): Promise<T> {
  if (!platform.Gateway) {
    throw new Error("IA collect platform not configured");
  }
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`/esport/ia/proxy?path=${encodeURIComponent(apiPath)}`);
  if (!res.ok) throw new Error(`IA GET ${apiPath} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** A8 CQe：IA POST — 经后端代理转发 */
async function collectIaPost<T>(
  platform: CollectPlatformInfo,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!platform.Gateway) {
    throw new Error("IA collect platform not configured");
  }
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`/esport/ia/proxy?path=${encodeURIComponent(apiPath)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`IA POST ${apiPath} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function startIaCollector(): () => void {
  let stopped = false;
  let realtime: IaRealtimeClient | null = null;

  const collect = useCollectStore();

  // IA：浏览器直连 A8 聚合 wss://47.115.75.57/esport/ws/IA
  realtime = createIaRealtimeClient();
  void realtime.start(handleIaRealtimeMessage);

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        const platform = await getCollectPlatform(PLATFORM);
        if (!platform?.Gateway) {
          console.warn("[IA] 采集跳过：无 Gateway");
          await wait(POLL_MS);
          continue;
        }

        const games = await getGames(PLATFORM);
        const betRe = new RegExp(
          platform.BetName || "([全场].+获胜$)|([地图\\d].+获胜者$)",
        );

        const listRes = await collectIaGet<{ code?: number; data?: { data?: Array<Record<string, unknown>> } }>(
          platform,
          "/api/game/game/gameListPageSplit/",
        );
        if (listRes.code !== undefined && listRes.code !== 1) {
          await wait(POLL_MS);
          continue;
        }

        const rawList = listRes.data?.data ?? [];
        const list = rawList.filter((row) => games.includes(String(row.game_type_id ?? "")));

        const matchPayload: CollectMatchDto[] = [];
        for (const row of list) {
          const homeName = String(
            row.team_name_1 ||
            row.team_a_name ||
            row.home_team_name ||
            row.home_name ||
            row.team1_name ||
            "主队",
          ).trim();
          const awayName = String(
            row.team_name_2 ||
            row.team_b_name ||
            row.away_team_name ||
            row.away_name ||
            row.team2_name ||
            "客队",
          ).trim();
          const homeId = pickIaTeamId(row, "home");
          const awayId = pickIaTeamId(row, "away");

          matchPayload.push({
            Type: PLATFORM,
            SourceMatchID: row.id as string | number,
            SourceGameID: row.game_type_id as string | number,
            BO: Number(row.bo || row.best_of || 0) || 0,
            StartTime: parseStartTime(row.start_time || row.begin_time || row.game_start_time),
            Home: homeName,
            HomeID: homeId,
            Away: awayName,
            AwayID: awayId,
            Teams: [
              {
                Type: PLATFORM,
                GameID: row.game_type_id as string | number,
                Name: homeName,
                TeamID: homeId,
                Logo: "",
              },
              {
                Type: PLATFORM,
                GameID: row.game_type_id as string | number,
                Name: awayName,
                TeamID: awayId,
                Logo: "",
              },
            ],
          });
        }

        await collect.saveMatch(PLATFORM, matchPayload);

        for (const row of list) {
          if (stopped) break;
          const matchId = String(row.id ?? "");
          const bets = await loadIaBets(platform, matchId, betRe);
          if (bets.length) await collect.saveBets(PLATFORM, matchId, bets);
          matchCount += 1;
        }
      } catch (err) {
        console.warn("[IA] collect error", err);
        notifyCollectError("IA", err);
      } finally {
        console.debug(`[IA]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;
    void realtime?.stop();
    realtime = null;
  };
}

async function loadIaBets(
  platform: CollectPlatformInfo,
  matchId: string,
  betRe: RegExp,
): Promise<CollectBetDto[]> {
  const oddsStore = useOddsStore();
  const res = await collectIaPost<{ code?: number; data?: { plays?: Array<Record<string, unknown>> } }>(
    platform,
    "/api/game/game/getPointsListSplit",
    { game_id: matchId, lang: 1 },
  );
  if (res.code !== undefined && res.code !== 1) return [];

  const bets: CollectBetDto[] = [];
  const plays = res.data?.plays ?? [];

  for (const play of plays) {
    const children = (play.child_plays ?? []) as Array<Record<string, unknown>>;
    for (const child of children) {
      const betKey = betKeyFromChild(child);
      if (!betRe.test(betKey)) continue;

      const mapNum = Number(child.match) || 0;
      const playId = String(child.id ?? "");
      const points = (child.team_points ?? []) as Array<Record<string, unknown>>;
      const homePt = points[0];
      const awayPt = points[1];
      const locked = child.status !== 1 || homePt?.status !== 1 || awayPt?.status !== 1;

      if (homePt) {
        oddsStore.save(PLATFORM, {
          id: String(homePt.id),
          odds: Number(homePt.point) || 0,
          isLock: locked,
          betId: playId,
          time: Date.now(),
        });
      }
      if (awayPt) {
        oddsStore.save(PLATFORM, {
          id: String(awayPt.id),
          odds: Number(awayPt.point) || 0,
          isLock: locked,
          betId: playId,
          time: Date.now(),
        });
      }

      bets.push({
        Type: PLATFORM,
        SourceMatchID: matchId,
        SourceBetID: playId,
        Map: mapNum,
        BetName: betKey,
        SourceHomeID: homePt ? String(homePt.id) : "",
        HomeName: homePt ? String(homePt.name ?? "") : "",
        HomeOdds: homePt ? Number(homePt.point) || 0 : 0,
        SourceAwayID: awayPt ? String(awayPt.id) : "",
        AwayName: awayPt ? String(awayPt.name ?? "") : "",
        AwayOdds: awayPt ? Number(awayPt.point) || 0 : 0,
        Status: locked ? "Locked" : "Normal",
      });
    }
  }

  return bets.sort((a, b) => a.Map - b.Map);
}
