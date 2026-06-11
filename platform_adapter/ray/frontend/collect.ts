import { createRayRealtimeClient, type RayRealtimeMessage } from "./realtime";
import { RAY_A8_COLLECT } from "./a8Collect";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { directGet } from "@/shared/http";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { groupRayOddsToSaveBets } from "../shared/save_bets.js";
import { rayMatchStage } from "../shared/match_stage.js";

const PLATFORM = PLATFORMS.RAY;
const POLL_MS = 30_000;

/** 与 gamebet_backend/shared/ray_paths.js 保持一致 */
export function rayApiPath(gateway: string | undefined, apiPath: string): string {
  const base = String(gateway || "").replace(/\/+$/, "");
  let path = String(apiPath || "").replace(/^\//, "");
  if (base.endsWith("/v2")) {
    path = path.replace(/^v2\//, "");
    return `/${path}`;
  }
  if (path.startsWith("v2/")) return `/${path}`;
  return `/v2/${path}`;
}


function rayHeaders(token: string): Record<string, string> {
  const auth = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  return {
    authorization: auth,
    Accept: "application/json, text/plain, */*",
  };
}

/** A8 bQe：Nr.get 直连 RAY gateway */
async function collectRayGet<T>(
  platform: CollectPlatformInfo,
  apiPath: string,
  query = "",
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("RAY collect platform not configured");
  }
  const path = rayApiPath(platform.Gateway, apiPath);
  const base = platform.Gateway.replace(/\/+$/, "");
  const q = query ? (path.includes("?") ? "&" : "?") + query : "";
  const url = `${base}${path}${q}`;
  return directGet<T>(url, rayHeaders(platform.Token));
}

/** dev HMR 时停止上一轮 poll + SocketCluster（对齐 OB `mqtt.ts` dispose） */
let rayCollectorStop: (() => void) | null = null;

/** A8 `vQe` / `r$`：Decimal 或原始值 → number */
function rayNum(raw: unknown): number {
  if (raw != null && typeof raw === "object" && "toNumber" in raw) {
    const fn = (raw as { toNumber?: () => number }).toNumber;
    if (typeof fn === "function") return fn.call(raw) || 0;
  }
  return Number(raw) || 0;
}

export { rayMatchStage as rayStage };

function rayLogo(path: string): string {
  if (!path) return "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://statics.freestaticsasia.com${p}`;
}

/** A8 `bQe` 内联 `t` → CollectPlatformInfo（仅采集 HTTP 用） */
function rayCollectPlatform(): CollectPlatformInfo {
  return {
    Gateway: RAY_A8_COLLECT.gateway,
    Token: RAY_A8_COLLECT.token,
    BetName: RAY_A8_COLLECT.betName,
  };
}

type RayOddsStore = Pick<ReturnType<typeof useOddsStore>, "isOdds" | "save">;

export function handleRayRealtimeMessage(
  msg: RayRealtimeMessage,
  odds: RayOddsStore,
  now = Date.now(),
): void {
  if (msg.source !== "odds" || !Array.isArray(msg.odds)) return;
  for (const row of msg.odds) {
    const id = String(row.id ?? "");
    if (!id || !odds.isOdds(PLATFORM, id)) continue;
    odds.save(PLATFORM, {
      id,
      odds: Number(row.odds) || 0,
      isLock: row.status !== 1,
      time: now,
    });
  }
}

export function startRayCollector(): () => void {
  rayCollectorStop?.();
  let stopped = false;
  const realtime = createRayRealtimeClient();
  const betRe = new RegExp(RAY_A8_COLLECT.betName);

  const odds = useOddsStore();
  const collect = useCollectStore();

  void (async () => {
    try {
      await realtime.start((msg) => {
        if (stopped) return;
        handleRayRealtimeMessage(msg, odds);
      });
    } catch (err) {
      if (!stopped) console.warn("[RAY] ws loop", err);
    }
  })();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        const platform = rayCollectPlatform();
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
          return (RAY_A8_COLLECT.games as readonly string[]).includes(gid) && start < horizon;
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
            BO: rayNum(row.round),
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

        // [A8 可证实] vQe：saveMatch 后顺序 await 每场 odds → saveBets，不用 Promise.all
        matchCount = list.length;
        for (const row of list) {
          const matchId = row.id as string | number;
          const bets = await loadRayBets(platform, String(matchId), betRe);
          if (bets.length) {
            console.debug(
              `[RAY] saveBets ${matchId} maps=${bets.map((b) => b.Map).join(",")}`,
            );
          }
          await collect.saveBets(PLATFORM, matchId, bets);
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

  const stop = () => {
    stopped = true;
    void realtime.stop();
    if (rayCollectorStop === stop) rayCollectorStop = null;
  };
  rayCollectorStop = stop;
  return stop;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    rayCollectorStop?.();
  });
}

async function loadRayBets(
  platform: CollectPlatformInfo,
  matchId: string,
  betRe: RegExp,
): Promise<CollectBetDto[]> {
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

  const oddsList = (result.odds ?? []) as Array<Record<string, unknown>>;
  const now = Date.now();
  for (const p of oddsList) {
    const group = String(p.group_name ?? "");
    if (p.status === 4 || !betRe.test(group)) continue;
    const oddsId = String(p.odds_id ?? "");
    const groupId = String(p.odds_group_id ?? "");
    const isHome = String(p.team_id) === String(homeTeam.team_id);
    const isAway = String(p.team_id) === String(awayTeam.team_id);
    oddsStore.save(PLATFORM, {
      id: oddsId,
      odds: Number(p.odds) || 0,
      isLock: p.status !== 1,
      betId: groupId,
      side: isHome ? "home" : isAway ? "away" : undefined,
      time: now,
    });
  }

  return groupRayOddsToSaveBets(
    result as { id: string | number; team?: unknown[]; odds?: unknown[] },
    betRe,
    PLATFORM,
  ) as CollectBetDto[];
}
