import { hasA8PluginRuntime } from "@/extension/bridge";
import { getCollectPlatform, getGames } from "@/api/esport";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { handleIaRealtimeMessage } from "./messages";
import { createIaRealtimeClient, type IaRealtimeClient } from "./realtime";
import { loadIaBets } from "./markets";
import { IA_PLUGIN_REQUIRED_MSG, iaCollectGet } from "./transport";

export { iaMainWinBetKey } from "../shared/save_bets";

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
          platform.BetName || "(\\[全场\\].+获胜$)|(\\[地图\\d+\\]\\s*获胜者$)",
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
