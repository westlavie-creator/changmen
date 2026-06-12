import { hasA8PluginRuntime } from "@/extension/bridge";
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
import { IA_PLUGIN_REQUIRED_MSG, iaCollectGet, iaCollectPost } from "./transport";

const PLATFORM = PLATFORMS.IA;
const POLL_MS = 30_000;
/** 对齐 PB：拉数 30s，上报服务端至多 60s 一次（A8 本地上报；changmen 暂降频） */
const SAVE_MS = 60_000;

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

/** 与 shared/catalog/market_catalog.js iaLegacyWinBetName 一致：排除手枪局/回合子盘 */
export function iaMainWinBetKey(key: string): boolean {
  const name = String(key ?? "").trim();
  if (!name || name.includes("+")) return false;
  if (/手枪局/.test(name)) return false;
  if (/回合/.test(name)) return false;
  return /^(\[全场\].+获胜)$|^(\[地图\d+\]\s*获胜者)$/.test(name);
}

function pickIaTeamId(row: Record<string, unknown>, side: "home" | "away"): string {
  const raw =
    side === "home"
      ? row.team_id_1 ?? row.team_a_id ?? row.home_id ?? row.home_team_id
      : row.team_id_2 ?? row.team_b_id ?? row.away_id ?? row.away_team_id;
  if (raw == null) return "";
  return String(raw).trim();
}

export function startIaCollector(): () => void {
  let stopped = false;
  let lastSaveAt = 0;
  let realtime: IaRealtimeClient | null = null;
  let pluginMissingNotified = false;

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

        if (!hasA8PluginRuntime()) {
          if (!pluginMissingNotified) {
            notifyCollectError("IA", IA_PLUGIN_REQUIRED_MSG);
            pluginMissingNotified = true;
          }
          await wait(POLL_MS);
          continue;
        }
        pluginMissingNotified = false;

        const games = await getGames(PLATFORM);
        const betRe = new RegExp(
          platform.BetName || "([全场].+获胜$)|([地图\\d+]\\s*获胜者$)",
        );

        const listRes = await iaCollectGet<{ code?: number; data?: { data?: Array<Record<string, unknown>> } }>(
          platform,
          "/api/game/game/gameListPageSplit/",
        );
        if (listRes.code !== undefined && listRes.code !== 1) {
          await wait(POLL_MS);
          continue;
        }

        const rawList = listRes.data?.data ?? [];
        const list = rawList.filter((row) => games.includes(String(row.game_type_id ?? "")));

        const shouldSave = Date.now() - lastSaveAt > SAVE_MS;
        const matchPayload: CollectMatchDto[] = [];
        const betsByMatch = new Map<string, CollectBetDto[]>();

        for (const row of list) {
          if (stopped) break;
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
          const matchId = String(row.id ?? "");

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

          const bets = await loadIaBets(platform, matchId, betRe);
          betsByMatch.set(matchId, bets);
          matchCount += 1;
        }

        if (shouldSave && matchPayload.length) {
          const saved = await collect.saveMatch(PLATFORM, matchPayload);
          if (saved) {
            for (const [mid, bets] of betsByMatch) {
              if (!bets.length) continue;
              await collect.saveBets(PLATFORM, mid, bets);
            }
            lastSaveAt = Date.now();
          }
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
  const res = await iaCollectPost<{ code?: number; data?: { plays?: Array<Record<string, unknown>> } }>(
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
      if (!iaMainWinBetKey(betKey)) continue;

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
