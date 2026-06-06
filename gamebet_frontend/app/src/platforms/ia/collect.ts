import { io, type Socket } from "socket.io-client";
import { getCollectPlatform, getGames } from "@/api/esport";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS, relayWsUrl } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@/platforms/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.IA;
const POLL_MS = 30_000;
const IA_WS_PATH = "/esport/ws/IA";

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

type IaRelayApi = {
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  onMessage: (cb: (msg: Record<string, unknown>) => void) => () => void;
};

function iaIpcRelay(): IaRelayApi | null {
  const api = (window as unknown as { gamebetRelays?: { ia?: IaRelayApi | null } })
    .gamebetRelays?.ia;
  return api ?? null;
}

export function startIaCollector(): () => void {
  let stopped = false;
  let socket: Socket | null = null;

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const handleIaMessage = (msg: Record<string, unknown>) => {
    const type = msg.message_type;
    const content = (msg.content ?? {}) as Record<string, unknown>;

    if (type === "message_type_bet_item_single_lock") {
      const playId = content.play_id;
      if (!playId) return;
      odds.updateBetLock(PLATFORM, String(playId), content.status !== 1);
      matchStore.refreshOddsOnBets();
      return;
    }

    if (type === "message_type_push_point_change") {
      const pointId = String(content.point_id ?? "");
      if (!pointId || !odds.isOdds(PLATFORM, pointId)) return;
      odds.save(PLATFORM, {
        id: pointId,
        odds: Number(content.point) || 0,
        isLock: false,
        betId: String(content.play_id ?? ""),
        time: Date.now(),
      });
      matchStore.refreshOddsOnBets();
    }
  };

  const bindSocketHandlers = (s: Socket) => {
    s.on("connect", () => {
      s.emit("RoomJoin", { room_type: "room_type_index_content_push" });
    });
    s.on("roomMessageCallBack", handleIaMessage);
  };

  const connectWs = () => {
    if (stopped) return;
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;

    const relayFull = relayWsUrl(IA_WS_PATH);
    const relayBase = relayFull.slice(0, relayFull.length - IA_WS_PATH.length);
    const relay = io(relayBase, {
      transports: ["websocket"],
      path: IA_WS_PATH,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 8000,
    });
    bindSocketHandlers(relay);
    socket = relay;
  };

  // Electron packaged：IPC → IaRelayCore（主进程直连 IA，注入 Origin header）
  // Web / Electron dev：Socket.IO 透明隧道 /esport/ws/IA
  const iaApi = iaIpcRelay();
  let removeIaListener: (() => void) | null = null;

  if (iaApi) {
    removeIaListener = iaApi.onMessage(handleIaMessage);
    void iaApi.start();
  } else {
    void connectWs();
  }

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
          const homeName =
            row.team_name_1 ||
            row.team_a_name ||
            row.home_team_name ||
            row.home_name ||
            row.team1_name ||
            "主队";
          const awayName =
            row.team_name_2 ||
            row.team_b_name ||
            row.away_team_name ||
            row.away_name ||
            row.team2_name ||
            "客队";

          matchPayload.push({
            Type: PLATFORM,
            SourceMatchID: row.id as string | number,
            SourceGameID: row.game_type_id as string | number,
            BO: Number(row.bo || row.best_of || 0) || 0,
            StartTime: parseStartTime(row.start_time || row.begin_time || row.game_start_time),
            Home: String(homeName),
            HomeID: String(row.team_a_id || row.home_id || ""),
            Away: String(awayName),
            AwayID: String(row.team_b_id || row.away_id || ""),
            Teams: [
              {
                Type: PLATFORM,
                GameID: row.game_type_id as string | number,
                Name: String(homeName),
                TeamID: String(row.team_a_id || row.home_id || ""),
                Logo: "",
              },
              {
                Type: PLATFORM,
                GameID: row.game_type_id as string | number,
                Name: String(awayName),
                TeamID: String(row.team_b_id || row.away_id || ""),
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
    if (iaApi) {
      removeIaListener?.();
      void iaApi.stop();
    } else {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    }
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
