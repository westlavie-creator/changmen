import socketClusterClient from "socketcluster-client";
import { getCollectPlatform, getGames } from "@/api/esport";
import { collectRayGet } from "@/utils/collectHttp";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS } from "@/utils/platform";
import { wait } from "@/utils/wait";
import { notifyCollectError } from "@/utils/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.RAY;
const POLL_MS = 30_000;
const WIN_GROUP = /^获胜者$/;

function rayStage(map: unknown): number {
  if (map === "final") return 0;
  return Number(map) || 0;
}

function rayLogo(path: string): string {
  if (!path) return "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://statics.freestaticsasia.com${p}`;
}

export function startRayCollector(): () => void {
  let stopped = false;
  let socket: ReturnType<typeof socketClusterClient.create> | null = null;

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const port = Number(location.port) || (location.protocol === "https:" ? 443 : 80);
  socket = socketClusterClient.create({
    hostname: location.hostname,
    protocolVersion: 1,
    secure: location.protocol === "https:",
    port,
    path: "/esport/ws/RAY",
    autoConnect: true,
    ackTimeout: 10_000,
  });

  void (async () => {
    try {
      const channel = socket!.subscribe("match");
      await channel.listener("subscribe").once();
      for await (const msg of channel) {
        if (stopped) break;
        const data = msg as { source?: string; odds?: Array<Record<string, unknown>> };
        if (data.source !== "odds" || !Array.isArray(data.odds)) continue;
        for (const row of data.odds) {
          const id = String(row.id ?? row.odds_id ?? "");
          if (!id || !odds.isOdds(PLATFORM, id)) continue;
          odds.save(PLATFORM, {
            id,
            odds: Number(row.odds) || 0,
            isLock: row.status !== 1,
            betId: String(row.odds_group_id ?? row.market_id ?? ""),
            time: Date.now(),
          });
        }
        matchStore.refreshOddsOnBets();
      }
    } catch (err) {
      if (!stopped) console.warn("[RAY] ws loop", err);
    }
  })();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        if (!collect.isEnabled(PLATFORM)) {
          await wait(POLL_MS);
          continue;
        }

        const platform = await getCollectPlatform(PLATFORM);
        if (!platform?.Gateway || !platform.Token) {
          console.warn(
            "[RAY] 采集跳过：Client_GetCollectPlatform 无 Gateway/Token（platforms.json 与 ACCOUNT 均无 RAY 凭证）",
          );
          await wait(POLL_MS);
          continue;
        }

        const games = await getGames(PLATFORM);
        const listRes = await collectRayGet<{ code: number; result?: Array<Record<string, unknown>> }>(
          platform,
          "match",
          "match_type=2&page=1",
        );
        if (listRes.code !== 200 || !Array.isArray(listRes.result)) {
          await wait(POLL_MS);
          continue;
        }

        const horizon = Date.now() + 3600_000;
        const list = listRes.result.filter((row) => {
          const gid = String(row.game_id ?? "");
          const start = new Date(String(row.start_time ?? 0)).getTime();
          return games.includes(gid) && start < horizon;
        });

        const matchPayload: CollectMatchDto[] = [];
        for (const row of list) {
          const teams = (row.team ?? []) as Array<Record<string, unknown>>;
          const home = teams.find((t) => t.pos === 1);
          const away = teams.find((t) => t.pos === 2);
          if (!home || !away) continue;
          matchPayload.push({
            SourceMatchID: row.id as string | number,
            SourceGameID: row.game_id as string | number,
            Type: PLATFORM,
            StartTime: new Date(String(row.start_time)).getTime(),
            BO: Number(row.round) || 0,
            HomeID: home.team_id as string | number,
            Home: String(home.team_name ?? ""),
            AwayID: away.team_id as string | number,
            Away: String(away.team_name ?? ""),
            Teams: [
              {
                Type: PLATFORM,
                TeamID: home.team_id as string | number,
                Name: String(home.team_name ?? ""),
                GameID: row.game_id as string | number,
                Logo: rayLogo(String(home.team_logo ?? "")),
              },
              {
                Type: PLATFORM,
                TeamID: away.team_id as string | number,
                Name: String(away.team_name ?? ""),
                GameID: row.game_id as string | number,
                Logo: rayLogo(String(away.team_logo ?? "")),
              },
            ],
          });
        }

        await collect.saveMatch(PLATFORM, matchPayload);

        for (const row of list) {
          if (stopped) break;
          const matchId = row.id as string | number;
          const bets = await loadRayBets(platform, String(matchId));
          if (bets.length) await collect.saveBets(PLATFORM, matchId, bets);
          matchCount += 1;
        }
      } catch (err) {
        console.warn("[RAY] collect error", err);
        notifyCollectError("RAY", err);
      } finally {
        console.debug(`[RAY]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;
    socket?.disconnect();
    socket = null;
  };
}

async function loadRayBets(platform: CollectPlatformInfo, matchId: string): Promise<CollectBetDto[]> {
  const res = await collectRayGet<{ code: number; result?: Record<string, unknown> }>(
    platform,
    "odds",
    `match_id=${matchId}`,
  );
  if (res.code !== 200 || !res.result) return [];

  const oddsStore = useOddsStore();
  const result = res.result;
  const teams = (result.team ?? []) as Array<Record<string, unknown>>;
  const homeTeam = teams.find((t) => t.pos === 1);
  const awayTeam = teams.find((t) => t.pos === 2);
  if (!homeTeam || !awayTeam) return [];

  const grouped = new Map<string, CollectBetDto>();
  const oddsList = (result.odds ?? []) as Array<Record<string, unknown>>;

  for (const p of oddsList) {
    const group = String(p.group_name ?? "");
    if (p.status === 4 || !WIN_GROUP.test(group)) continue;

    const oddsId = String(p.odds_id ?? "");
    const groupId = String(p.odds_group_id ?? "");
    const stage = rayStage(p.match_stage);
    const prefix = stage === 0 ? "[全场]" : `[地图${stage}]`;

    oddsStore.save(PLATFORM, {
      id: oddsId,
      odds: Number(p.odds) || 0,
      isLock: p.status !== 1,
      betId: groupId,
      time: Date.now(),
    });

    let row = grouped.get(groupId);
    const isHome = String(p.team_id) === String(homeTeam.team_id);
    const isAway = String(p.team_id) === String(awayTeam.team_id);

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

    row = {
      Type: PLATFORM,
      SourceMatchID: result.id as string | number,
      SourceBetID: groupId,
      Map: stage,
      GroupName: group,
      BetName: `${prefix} ${group}`,
      SourceHomeID: isHome ? oddsId : "",
      HomeName: isHome ? String(p.name ?? "") : "",
      HomeOdds: isHome ? Number(p.odds) || 0 : 0,
      SourceAwayID: isAway ? oddsId : "",
      AwayName: isAway ? String(p.name ?? "") : "",
      AwayOdds: isAway ? Number(p.odds) || 0 : 0,
      Status: p.status === 1 ? "Normal" : "Locked",
    };
    grouped.set(groupId, row);
  }

  return [...grouped.values()];
}
