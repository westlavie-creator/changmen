import mqtt, { type MqttClient } from "mqtt";
import { getCollectPlatform, getGames } from "@/api/esport";
import { collectObGet } from "@/utils/collectHttp";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS, OB_MQTT_PASS, OB_MQTT_USER, relayWsUrl } from "@/utils/platform";
import { wait } from "@/utils/wait";
import { notifyCollectError } from "@/utils/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.OB;
const POLL_MS = 30_000;
const STAGE_WAIT_MS = 1500;

function parseTopic(topic: string): { topic: string; matchId: string } | null {
  const m = /(.+?)(\d+)/.exec(topic);
  if (!m) return null;
  return { topic: m[1]!, matchId: m[2]! };
}

function obSubscribeTopics(matchId: string | number): string[] {
  const id = String(matchId);
  return [
    `/odd/insert/${id}`,
    `/odd/statusUpdate/${id}`,
    `/odd/visible/${id}`,
    `/odd/suspended/${id}`,
    `/market/sortCodeUpdate/${id}`,
    `/market/suspended/${id}`,
    `/market/visible/${id}`,
    `/market/statusUpdate/${id}`,
    `/market/oddsUpdate/${id}`,
  ];
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

export function startObCollector(): () => void {
  let stopped = false;
  let client: MqttClient | null = null;
  let loopPromise: Promise<void> | null = null;
  const pendingSubs: string[] = [];

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  client = mqtt.connect(relayWsUrl("/esport/ws/OB"), {
    username: OB_MQTT_USER,
    password: OB_MQTT_PASS,
    clientId: `mqttjs_app_${Date.now()}`,
    clean: true,
    keepalive: 60,
    reconnectPeriod: 5000,
    protocolId: "MQTT",
  });

  client.on("message", (topic, buf) => {
    const payload = buf.toString();
    odds.updateMessage(PLATFORM, payload);
    const parsed = parseTopic(topic);
    if (!parsed) return;
    let rows: Array<{ id: string; odd: unknown; market_id: string; suspended?: number }>;
    try {
      rows = JSON.parse(payload);
    } catch {
      return;
    }
    if (!Array.isArray(rows)) return;

    switch (parsed.topic) {
      case "/market/oddsUpdate/":
        for (const row of rows) {
          if (!odds.isOdds(PLATFORM, row.id)) continue;
          odds.save(PLATFORM, {
            id: row.id,
            odds: num(row.odd),
            isLock: false,
            betId: row.market_id,
            time: Date.now(),
          });
        }
        matchStore.refreshOddsOnBets();
        break;
      case "/market/statusUpdate/":
        for (const row of rows) {
          odds.updateBetLock(PLATFORM, row.market_id, true);
        }
        matchStore.refreshOddsOnBets();
        break;
      case "/market/suspended/":
        for (const row of rows) {
          odds.updateBetLock(PLATFORM, row.market_id, row.suspended === 1);
        }
        matchStore.refreshOddsOnBets();
        break;
      default:
        break;
    }
  });

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
        if (!platform?.Gateway) {
          await wait(POLL_MS);
          continue;
        }

        const games = await getGames(PLATFORM);
        const betRe = new RegExp(platform.BetName || ".*");

        const index = await collectObGet<{ status: string; data?: Array<Record<string, unknown>> }>(
          platform,
          "game/index",
          "game_id=0&flag=1&day=1",
        );
        if (index.status === "false") {
          await wait(POLL_MS);
          continue;
        }

        const rawList = (index.data ?? []) as Array<Record<string, unknown>>;
        const horizon = Date.now() / 1000 + 3600;
        const list = rawList.filter((row) => {
          const gid = String(row.game_id ?? "");
          return games.includes(gid) && num(row.start_time) < horizon;
        });

        const matchPayload: CollectMatchDto[] = [];
        for (const row of list) {
          const teams = String(row.match_team ?? "")
            .replace(/&nbsp;/g, " ")
            .split(",");
          const teamIds = String(row.team_id ?? "").split(",");
          if (teams.length !== 2 || teamIds.length !== 2) continue;
          matchPayload.push({
            Type: PLATFORM,
            SourceGameID: row.game_id as string | number,
            SourceMatchID: row.id as string | number,
            BO: num(row.bo),
            StartTime: num(row.start_time) * 1000,
            Home: teams[0]!,
            HomeID: teamIds[0]!,
            Away: teams[1]!,
            AwayID: teamIds[1]!,
            Teams: [
              {
                Type: PLATFORM,
                GameID: row.game_id as string | number,
                Name: teams[0]!,
                TeamID: teamIds[0]!,
                Logo: "",
              },
              {
                Type: PLATFORM,
                GameID: row.game_id as string | number,
                Name: teams[1]!,
                TeamID: teamIds[1]!,
                Logo: "",
              },
            ],
          });
        }

        await collect.saveMatch(PLATFORM, matchPayload);

        for (const row of list) {
          if (stopped) break;
          const matchId = row.id as string | number;
          if (client?.connected) {
            client.unsubscribe(obSubscribeTopics(matchId));
            client.subscribe(obSubscribeTopics(matchId), (err) => {
              if (!err) pendingSubs.push(String(matchId));
            });
          }

          const bo = num(row.bo);
          const maxStage = bo === 1 ? 0 : bo;
          const bets = await loadObBets(platform, String(matchId), maxStage, betRe, teamsFromRow(row));
          if (bets.length) await collect.saveBets(PLATFORM, matchId, bets);
          matchCount += 1;
        }
      } catch (err) {
        console.warn("[OB] collect error", err);
        notifyCollectError("OB", err);
      } finally {
        console.debug(`[OB]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  loopPromise = poll();

  return () => {
    stopped = true;
    client?.end(true);
    client = null;
    void loopPromise;
  };
}

async function loadObBets(
  platform: CollectPlatformInfo,
  matchId: string,
  maxStage: number,
  betRe: RegExp,
  teamNames: [string, string],
): Promise<CollectBetDto[]> {
  const odds = useOddsStore();
  const bets: CollectBetDto[] = [];

  for (let stage = 0; stage <= maxStage; stage += 1) {
    const view = await collectObGet<{ status: string; data?: Array<Record<string, unknown>> }>(
      platform,
      "game/view",
      `match_id=${matchId}&stage_id=${stage}`,
    );
    if (view.status !== "true" || !Array.isArray(view.data)) continue;

    for (const block of view.data) {
      const round = num(block.round);
      const label = `[${round === 0 ? "全场" : `地图${round}`}]-${String(block.cn_name ?? "").replace(/&nbsp;/g, "")}`;
      if (block.status === 12 || block.visible === 0 || !betRe.test(label)) continue;

      const locked =
        block.status !== 6 || block.visible !== 1 || block.suspended !== 0;
      const oddsMap = (block.odds ?? {}) as Record<string, Record<string, unknown>>;
      const entries = Object.values(oddsMap);
      for (const p of entries) {
        odds.save(PLATFORM, {
          id: String(p.id),
          odds: num(p.odd),
          isLock: locked,
          betId: String(block.id),
          time: Date.now(),
        });
      }
      const home = entries.find((p) => p.name === "@T1");
      const away = entries.find((p) => p.name === "@T2");
      if (!home || !away) continue;

      bets.push({
        Type: PLATFORM,
        SourceMatchID: matchId,
        Map: round,
        SourceBetID: String(block.id),
        BetName: label,
        SourceHomeID: String(home.id),
        HomeName: teamNames[0] ?? "",
        HomeOdds: num(home.odd),
        SourceAwayID: String(away.id),
        AwayName: teamNames[1] ?? "",
        AwayOdds: num(away.odd),
        Status: locked ? "Locked" : "Normal",
      });
    }
    await wait(STAGE_WAIT_MS);
  }

  return bets;
}

function teamsFromRow(row: Record<string, unknown>): [string, string] {
  const teams = String(row.match_team ?? "")
    .replace(/&nbsp;/g, " ")
    .split(",");
  return [teams[0] ?? "", teams[1] ?? ""];
}
