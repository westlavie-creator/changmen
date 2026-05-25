import { getCollectPlatform, getGames } from "@/api/esport";
import { collectTfGet } from "@/utils/collectHttp";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS, relayWsUrl } from "@/utils/platform";
import { tfWsAuthToken } from "@/utils/tfAuth";
import { wait } from "@/utils/wait";
import { notifyCollectError } from "@/utils/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.TF;
const POLL_MS = 30_000;
const STAGE_WAIT_MS = 1000;

function parseStartTime(raw: unknown): number {
  if (!raw) return Date.now();
  const ms = Date.parse(String(raw).replace(" ", "T"));
  return Number.isNaN(ms) ? Date.now() : ms;
}

function parseBo(raw: unknown): number {
  const m = String(raw ?? "").match(/BO(\d+)/i);
  return m ? Number(m[1]) || 0 : 0;
}

function stageFromTabName(tabName: string): { stageId: number; mapOption: string; marketOption: string } {
  const name = tabName.trim();
  if (!name || name === "MATCH") return { stageId: 0, mapOption: "", marketOption: "MATCH" };
  const mapMatch = /^MAP\s*(\d+)$/i.exec(name);
  if (mapMatch) {
    const n = Number(mapMatch[1]);
    return { stageId: n, mapOption: name, marketOption: "MAP" };
  }
  return { stageId: 0, mapOption: "", marketOption: "MATCH" };
}

function selectionOddsId(marketId: string, selectionName: string): string {
  return `${marketId}:${selectionName}`;
}

function pickSelection(
  market: Record<string, unknown>,
  side: string,
): Record<string, unknown> | undefined {
  const rows = (market.selection ?? []) as Array<Record<string, unknown>>;
  return rows.find((s) => s.name === side);
}

function marketLocked(market: Record<string, unknown>, home: Record<string, unknown>, away: Record<string, unknown>): boolean {
  if (home.status !== "open" || away.status !== "open") return true;
  if (market.settlement_status === "settled") return true;
  return false;
}

export function startTfCollector(): () => void {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const connectWs = async () => {
    if (stopped) return;
    const platform = await getCollectPlatform(PLATFORM);
    if (!platform?.Token) return;

    const auth = encodeURIComponent(tfWsAuthToken(platform.Token));
    const url = relayWsUrl(`/esport/ws/TF?auth_token=${auth}&combo=false`);

    try {
      ws?.close();
    } catch {
      /* ignore */
    }

    ws = new WebSocket(url);

    ws.onmessage = (ev) => {
      let payload: { data?: { market_id?: string; selection?: Array<Record<string, unknown>> } };
      try {
        payload = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const data = payload.data;
      if (!data?.selection || !data.market_id) return;

      const marketId = String(data.market_id);
      for (const sel of data.selection) {
        const id = selectionOddsId(marketId, String(sel.name ?? ""));
        if (!odds.isOdds(PLATFORM, id)) continue;
        odds.save(PLATFORM, {
          id,
          odds: Number(sel.euro_odds) || 0,
          isLock: sel.status !== "open",
          betId: marketId,
          time: Date.now(),
        });
      }
      matchStore.refreshOddsOnBets();
    };

    ws.onclose = () => {
      if (!stopped) {
        reconnectTimer = setTimeout(() => void connectWs(), 5000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  void connectWs();

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
          console.warn("[TF] 采集跳过：无 Gateway/Token（platforms.json 或 TF_* 环境变量）");
          await wait(POLL_MS);
          continue;
        }

        const games = await getGames(PLATFORM);
        const betRe = new RegExp(platform.BetName || "^获胜者$");

        const listRes = await collectTfGet<{ results?: Array<Record<string, unknown>> }>(platform, {
          game_id: "",
          timing: "today",
          market_option: "MATCH",
        });

        const horizon = Date.now() + 3600_000;
        const list = (listRes.results ?? []).filter((row) => {
          const gid = String(row.game_id ?? "");
          return games.includes(gid) && parseStartTime(row.start_datetime) < horizon;
        });

        const matchPayload: CollectMatchDto[] = [];
        for (const row of list) {
          const home = row.home as Record<string, unknown> | undefined;
          const away = row.away as Record<string, unknown> | undefined;
          if (!home || !away) continue;
          matchPayload.push({
            Type: PLATFORM,
            SourceMatchID: row.event_id as string | number,
            SourceGameID: row.game_id as string | number,
            BO: parseBo(row.best_of),
            StartTime: parseStartTime(row.start_datetime),
            Home: String(home.team_name ?? ""),
            HomeID: String(home.team_id ?? ""),
            Away: String(away.team_name ?? ""),
            AwayID: String(away.team_id ?? ""),
            Teams: [
              {
                Type: PLATFORM,
                GameID: row.game_id as string | number,
                Name: String(home.team_name ?? ""),
                TeamID: String(home.team_id ?? ""),
                Logo: "",
              },
              {
                Type: PLATFORM,
                GameID: row.game_id as string | number,
                Name: String(away.team_name ?? ""),
                TeamID: String(away.team_id ?? ""),
                Logo: "",
              },
            ],
          });
        }

        await collect.saveMatch(PLATFORM, matchPayload);

        for (const row of list) {
          if (stopped) break;
          const matchId = String(row.event_id ?? "");
          const teamNames: [string, string] = [
            String((row.home as Record<string, unknown>)?.team_name ?? ""),
            String((row.away as Record<string, unknown>)?.team_name ?? ""),
          ];
          const tabs = (row.market_tabs ?? []) as Array<{ tab_name?: string }>;
          const mapTabs = tabs
            .map((t) => String(t.tab_name ?? ""))
            .filter((name) => name && name !== "MATCH");

          const bets = await loadTfBets(platform, matchId, betRe, teamNames, mapTabs);
          if (bets.length) await collect.saveBets(PLATFORM, matchId, bets);
          matchCount += 1;
        }
      } catch (err) {
        console.warn("[TF] collect error", err);
        notifyCollectError("TF", err);
      } finally {
        console.debug(`[TF]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  };
}

async function loadTfBets(
  platform: CollectPlatformInfo,
  matchId: string,
  betRe: RegExp,
  teamNames: [string, string],
  mapTabs: string[],
): Promise<CollectBetDto[]> {
  const oddsStore = useOddsStore();
  const byStage = new Map<number, CollectBetDto>();

  const ingestResults = (results: Array<Record<string, unknown>>, stageMeta: ReturnType<typeof stageFromTabName>) => {
    for (const block of results) {
      const markets = (block.markets ?? []) as Array<Record<string, unknown>>;
      for (const market of markets) {
        const marketName = String(market.market_name ?? "");
        if (!betRe.test(marketName)) continue;

        const home = pickSelection(market, "home");
        const away = pickSelection(market, "away");
        if (!home || !away) continue;

        const marketId = String(market.market_id ?? "");
        const stageId = stageMeta.stageId;
        const locked = marketLocked(market, home, away);
        const homeId = selectionOddsId(marketId, "home");
        const awayId = selectionOddsId(marketId, "away");

        oddsStore.save(PLATFORM, {
          id: homeId,
          odds: Number(home.euro_odds) || 0,
          isLock: locked,
          betId: marketId,
          time: Date.now(),
        });
        oddsStore.save(PLATFORM, {
          id: awayId,
          odds: Number(away.euro_odds) || 0,
          isLock: locked,
          betId: marketId,
          time: Date.now(),
        });

        const label = stageId === 0 ? "全场" : `地图${stageId}`;
        byStage.set(stageId, {
          Type: PLATFORM,
          SourceMatchID: matchId,
          SourceBetID: marketId,
          Map: stageId,
          BetName: `[${label}]-${marketName}`,
          SourceHomeID: homeId,
          HomeName: teamNames[0] ?? "",
          HomeOdds: Number(home.euro_odds) || 0,
          SourceAwayID: awayId,
          AwayName: teamNames[1] ?? "",
          AwayOdds: Number(away.euro_odds) || 0,
          Status: locked ? "Locked" : "Normal",
        });
      }
    }
  };

  const matchRes = await collectTfGet<{ results?: Array<Record<string, unknown>> }>(platform, {
    event_id: matchId,
    market_option: "MATCH",
  });
  ingestResults(matchRes.results ?? [], stageFromTabName("MATCH"));

  for (const tabName of mapTabs) {
    await wait(STAGE_WAIT_MS);
    const meta = stageFromTabName(tabName);
    if (meta.marketOption !== "MAP") continue;
    const mapRes = await collectTfGet<{ results?: Array<Record<string, unknown>> }>(platform, {
      event_id: matchId,
      market_option: "MAP",
      map_option: meta.mapOption,
    });
    ingestResults(mapRes.results ?? [], meta);
  }

  return [...byStage.values()].sort((a, b) => a.Map - b.Map);
}
