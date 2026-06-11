import { getCollectPlatform, getGames } from "@/api/esport";
import { directGet } from "@/shared/http";
import { tfRequestHeaders } from "./auth";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";
import { a8StartTimeCollectAllowed } from "@/utils/a8MatchTime";
import { startTfOddsWs } from "./ws";

/** 与 gamebet_backend/shared/market_catalog.json → TF.match_winner 一致 */
const TF_DEFAULT_BET_NAME = "(独赢|获胜者)";

const TF_POLL_MS = 30_000;
const TF_STAGE_WAIT_MS = 1000;

function parseTfStartTimeMs(raw: unknown): number {
  if (!raw) return 0;
  const ms = Date.parse(String(raw).replace(" ", "T"));
  return Number.isNaN(ms) ? 0 : ms;
}

/** A8 NBe 列表过滤：game_id ∈ games 且 start < now + 3600s */
function tfListEventCollectAllowed(row: Record<string, unknown>): boolean {
  return a8StartTimeCollectAllowed(parseTfStartTimeMs(row.start_datetime));
}

function compileTfBetNameRegex(platformBetName?: string): RegExp {
  const pat = platformBetName?.trim() || TF_DEFAULT_BET_NAME;
  return new RegExp(pat);
}

function parseBo(raw: unknown): number {
  const m = String(raw ?? "").match(/BO(\d+)/i);
  return m ? Number(m[1]) || 0 : 0;
}

function stageFromTabName(
  tabName: string,
): { stageId: number; mapOption: string; marketOption: "MATCH" | "MAP" } | null {
  const name = tabName.trim();
  if (!name || name === "MATCH") return { stageId: 0, mapOption: "", marketOption: "MATCH" };
  const mapMatch = /^MAP\s*(\d+)$/i.exec(name);
  if (mapMatch) {
    const n = Number(mapMatch[1]);
    return { stageId: n, mapOption: name, marketOption: "MAP" };
  }
  // A8：非 MATCH 的 tab 一律按 MAP + map_option=tab 名请求
  return { stageId: 0, mapOption: name, marketOption: "MAP" };
}

/** A8 在 MATCH 详情响应的 market_tabs 中发现地图 tab（不用列表行上的 tabs） */
function extractMapTabsFromResults(results: Array<Record<string, unknown>>): string[] {
  const tabs: string[] = [];
  for (const block of results) {
    const marketTabs = (block.market_tabs ?? []) as Array<{ tab_name?: string }>;
    for (const t of marketTabs) {
      const name = String(t.tab_name ?? "").trim();
      if (name && name !== "MATCH" && !tabs.includes(name)) tabs.push(name);
    }
  }
  return tabs;
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

function marketLocked(
  market: Record<string, unknown>,
  home: Record<string, unknown>,
  away: Record<string, unknown>,
): boolean {
  if (home.status !== "open" || away.status !== "open") return true;
  if (market.settlement_status === "settled") return true;
  return false;
}

/** A8 NBe：浏览器直连 TF /api/v8/events/ */
async function collectTfGet<T>(
  platform: CollectPlatformInfo,
  query: Record<string, string>,
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("TF collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    combo: "false",
    outright: "false",
    lang: "zh",
    timezone: "Asia/Shanghai",
    ...query,
  });
  const url = `${base}/api/v8/events/?${qs}`;
  const headers = await tfRequestHeaders(platform.Token);
  return directGet<T>(url, headers);
}

const PLATFORM = PLATFORMS.TF;

export function startTfCollector(): () => void {
  let stopped = false;

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const stopWs = startTfOddsWs({
    getToken: async () => {
      const platform = await getCollectPlatform(PLATFORM);
      return platform?.Token;
    },
    onMessage: (payload) => {
      const data = payload.data;
      if (!data?.selection || !data.market_id) return;

      const marketId = String(data.market_id);
      const now = Date.now();
      for (const sel of data.selection) {
        const id = selectionOddsId(marketId, String(sel.name ?? ""));
        if (!odds.isOdds(PLATFORM, id)) continue;
        odds.save(PLATFORM, {
          id,
          odds: Number(sel.euro_odds) || 0,
          isLock: sel.status !== "open",
          betId: marketId,
          time: now,
        });
      }
      matchStore.refreshOddsOnBets();
    },
    onError: () => {
      notifyCollectError(PLATFORM, "WebSocket链接发生错误");
    },
  });

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        const platform = await getCollectPlatform(PLATFORM);
        if (!platform?.Gateway || !platform.Token) {
          console.warn("[TF] 采集跳过：无 Gateway/Token（A8 Client_GetCollectPlatform）");
          await wait(TF_POLL_MS);
          continue;
        }

        const games = await getGames(PLATFORM);
        const betRe = compileTfBetNameRegex(platform.BetName);

        const listRes = await collectTfGet<{ results?: Array<Record<string, unknown>> }>(platform, {
          game_id: "",
          timing: "today",
          market_option: "MATCH",
        });

        const list = (listRes.results ?? []).filter((row) => {
          const gid = String(row.game_id ?? "");
          return games.includes(gid) && tfListEventCollectAllowed(row);
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
            StartTime: parseTfStartTimeMs(row.start_datetime),
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

        await Promise.all(
          list.map(async (row) => {
            if (stopped) return;
            const matchId = String(row.event_id ?? "");
            const teamNames: [string, string] = [
              String((row.home as Record<string, unknown>)?.team_name ?? ""),
              String((row.away as Record<string, unknown>)?.team_name ?? ""),
            ];

            await loadTfBets(platform, matchId, betRe, teamNames);
            matchCount += 1;
          }),
        );
      } catch (err) {
        console.warn("[TF] collect error", err);
        notifyCollectError(PLATFORM, err);
      } finally {
        console.debug(`[TF]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(TF_POLL_MS);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;
    stopWs();
  };
}

async function loadTfBets(
  platform: CollectPlatformInfo,
  matchId: string,
  betRe: RegExp,
  teamNames: [string, string],
): Promise<CollectBetDto[]> {
  const oddsStore = useOddsStore();
  const byStage = new Map<number, CollectBetDto>();

  const ingestResults = (
    results: Array<Record<string, unknown>>,
    stageMeta: NonNullable<ReturnType<typeof stageFromTabName>>,
  ) => {
    for (const block of results) {
      const markets = (block.markets ?? []) as Array<Record<string, unknown>>;
      for (const market of markets) {
        const marketName = String(market.market_name ?? "");
        if (!betRe.test(marketName)) continue;

        const home = pickSelection(market, "home");
        const away = pickSelection(market, "away");
        if (!home || !away) continue;

        const marketId = String(market.market_id ?? "");
        const mapNum = Number(market.map_num);
        const stageId =
          Number.isFinite(mapNum) && mapNum > 0 ? mapNum : stageMeta.stageId;

        // A8 HTTP 详情：遍历 market 下全部 selection 写入 oddsStore
        const selections = (market.selection ?? []) as Array<Record<string, unknown>>;
        const now = Date.now();
        for (const sel of selections) {
          const selName = String(sel.name ?? "");
          if (!selName) continue;
          oddsStore.save(PLATFORM, {
            id: selectionOddsId(marketId, selName),
            odds: Number(sel.euro_odds) || 0,
            isLock: sel.status !== "open",
            betId: marketId,
            time: now,
          });
        }

        const locked = marketLocked(market, home, away);
        const homeId = selectionOddsId(marketId, "home");
        const awayId = selectionOddsId(marketId, "away");

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

  await wait(TF_STAGE_WAIT_MS);
  const matchRes = await collectTfGet<{ results?: Array<Record<string, unknown>> }>(platform, {
    event_id: matchId,
    market_option: "MATCH",
  });
  const matchResults = matchRes.results ?? [];
  ingestResults(matchResults, stageFromTabName("MATCH")!);

  const mapTabs = extractMapTabsFromResults(matchResults);
  for (const tabName of mapTabs) {
    await wait(TF_STAGE_WAIT_MS);
    const meta = stageFromTabName(tabName);
    if (!meta || meta.marketOption !== "MAP") continue;
    const mapRes = await collectTfGet<{ results?: Array<Record<string, unknown>> }>(platform, {
      event_id: matchId,
      market_option: "MAP",
      map_option: meta.mapOption,
    });
    ingestResults(mapRes.results ?? [], meta);
  }

  return [...byStage.values()].sort((a, b) => a.Map - b.Map);
}
