import { getCollectPlatform, getGames, saveLiveTimer, updatePlatform } from "@/api/esport";
import { OB_DEMO_LOGIN_URL } from "@/api/v4";
import { getObBetNameRe } from "./parse";

import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { getGameCodeForPlatformId } from "../../../packages/shared/catalog/game_catalog.browser";
import { collectObGet, loadMarketsForMatch, maxStageFromBo } from "./markets";
import {
  connectObMqtt,
  disconnectObMqtt,
  subscribeObMatchAfterView,
  unsubscribeObMatchBeforeView,
} from "./mqtt";
import { num } from "./parse";
import { directGet } from "@/shared/http";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";
import type { CollectMatchDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";

const PLATFORM = PLATFORMS.OB;
const POLL_MS = 30_000;

const TEAM_LOGO_URL = "https://uphw-cdn3.jomscxu.com/upload/json/pc.json";
const TEAM_LOGO_LS = "OBService:TeamLogo";

let teamLogos: Record<string, string> | null = null;

/** 对齐 A8 v0：移动端 device=2，PC=1 */
export function obDeviceId(userAgent?: string): string {
  return userAgent && /mobile/i.test(userAgent) ? "2" : "1";
}

async function loadObTeamLogosMap(): Promise<Record<string, string> | null> {
  try {
    const data = await directGet<{ team_imag?: Record<string, string> }>(TEAM_LOGO_URL, {});
    return data.team_imag ?? null;
  } catch {
    return null;
  }
}

/** 对齐 A8 e9：首轮采集前拉取队徽表（Nr.get 直连 CDN） */
export async function ensureObTeamLogosLoaded(): Promise<void> {
  if (teamLogos) return;
  teamLogos = await loadObTeamLogosMap();
  if (teamLogos) {
    localStorage.setItem(TEAM_LOGO_LS, JSON.stringify(teamLogos));
    return;
  }
  const cached = localStorage.getItem(TEAM_LOGO_LS);
  if (!cached) return;
  try {
    teamLogos = JSON.parse(cached) as Record<string, string>;
  } catch {
    teamLogos = null;
  }
}

/** 队徽 URL（需已 ensureObTeamLogosLoaded） */
export function resolveObTeamLogoSync(teamId: string): string {
  if (!teamLogos || !teamLogos[teamId]) return "";
  return `https://uphw-cdn6.peyesight.com/${teamLogos[teamId]}`;
}

/** 对齐 A8 e9：队徽 CDN */
export async function resolveObTeamLogo(teamId: string): Promise<string> {
  await ensureObTeamLogosLoaded();
  return resolveObTeamLogoSync(teamId);
}

/** 对齐 A8 $Me：采集 token 失效时试玩登录并写回平台配置 */
export async function refreshObCollectToken(): Promise<string | null> {
  try {
    const body = await directGet<{ data?: { pc?: string } }>(OB_DEMO_LOGIN_URL, {});
    const pc = body?.data?.pc;
    if (!pc) return null;
    const token = new URL(pc).searchParams.get("token");
    if (!token) return null;
    await updatePlatform({ provider: PLATFORMS.OB, token });
    return token;
  } catch {
    return null;
  }
}

/** 对齐 A8 MMe：拉取 live timer 并入库 */
export async function syncObLiveTimer(platform: CollectPlatformInfo): Promise<void> {
  const res = await collectObGet<{
    status: string;
    data?: Record<string, Record<string, unknown>>;
  }>(platform, "game/getTimer", "");
  if (res.status !== "true" || !res.data) return;
  const timers = Object.values(res.data).map((row) => ({
    MatchID: row.match_id,
    Round: num(row.round),
    StartTime: num(row.start_time) * 1000,
  }));
  await saveLiveTimer(PLATFORMS.OB, timers);
  // 对齐 A8：timer 入库后立即刷新 GetMatchs，不必等 30s 轮询
  void useMatchStore().fetchMatches(true);
}

/** game/index 列表行的 match_team → 主客队名 */
export function teamsFromListRow(row: Record<string, unknown>): [string, string] {
  const teams = String(row.match_team ?? "")
    .replace(/&nbsp;/g, " ")
    .split(",");
  return [teams[0] ?? "", teams[1] ?? ""];
}

/** game/index 列表 → Client_SaveMatch 载荷 */
export async function buildMatchesFromList(
  rows: Array<Record<string, unknown>>,
): Promise<CollectMatchDto[]> {
  await ensureObTeamLogosLoaded();
  const payload: CollectMatchDto[] = [];
  for (const row of rows) {
    const [homeName, awayName] = teamsFromListRow(row);
    const teamIds = String(row.team_id ?? "").split(",");
    if (!homeName || !awayName || teamIds.length !== 2) continue;
    const homeLogo = resolveObTeamLogoSync(teamIds[0]!);
    const awayLogo = resolveObTeamLogoSync(teamIds[1]!);
    payload.push({
      Type: PLATFORM,
      SourceGameID: row.game_id as string | number,
      SourceMatchID: row.id as string | number,
      BO: num(row.bo),
      StartTime: num(row.start_time) * 1000,
      Home: homeName,
      HomeID: teamIds[0]!,
      Away: awayName,
      AwayID: teamIds[1]!,
      Teams: [
        {
          Type: PLATFORM,
          GameID: row.game_id as string | number,
          Name: homeName,
          TeamID: teamIds[0]!,
          Logo: homeLogo,
        },
        {
          Type: PLATFORM,
          GameID: row.game_id as string | number,
          Name: awayName,
          TeamID: teamIds[1]!,
          Logo: awayLogo,
        },
      ],
    });
  }
  return payload;
}

export function startObCollector(): () => void {
  let stopped = false;
  let loopPromise: Promise<void> | null = null;

  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        let [platform, games] = await Promise.all([
          getCollectPlatform(PLATFORM),
          getGames(PLATFORM),
        ]);
        if (!platform?.Gateway) {
          await wait(POLL_MS);
          continue;
        }

        const betRe = getObBetNameRe(platform.BetName);

        const index = await collectObGet<{ status: string; data?: Array<Record<string, unknown>> | string }>(
          platform,
          "game/index",
          "game_id=0&flag=1&day=1",
        );
        if (index.status === "false") {
          if (index.data === "token") {
            const token = await refreshObCollectToken();
            if (token) platform = { ...platform, Token: token };
          }
          await wait(POLL_MS);
          continue;
        }

        const rawList = (index.data ?? []) as Array<Record<string, unknown>>;
        const horizon = Date.now() / 1000 + 3600;
        const list = rawList.filter((row) => {
          const gid = String(row.game_id ?? "");
          return games.includes(gid) && num(row.start_time) < horizon;
        });

        const matchPayload = await buildMatchesFromList(list);
        await collect.saveMatch(PLATFORM, matchPayload);

        for (const row of list) {
          if (stopped) break;
          const matchId = String(row.id ?? "");
          if (!matchId) continue;
          matchCount += 1;

          unsubscribeObMatchBeforeView(matchId);
          const gameCode = getGameCodeForPlatformId("OB", String(row.game_id ?? "")) || null;
          const loaded = await loadMarketsForMatch(
            platform,
            matchId,
            maxStageFromBo(row.bo),
            betRe,
            teamsFromListRow(row),
            gameCode,
          );
          if (loaded.bets.length && !loaded.hadError) {
            await collect.saveBets(PLATFORM, matchId, loaded.bets);
          }
          await subscribeObMatchAfterView(matchId);
        }

        await syncObLiveTimer(platform);
      } catch (err) {
        console.warn("[OB] collect error", err);
        notifyCollectError("OB", err);
      } finally {
        console.debug(`[OB]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void (async () => {
    await wait(3000);
    if (stopped) return;
    connectObMqtt(() => matchStore.refreshOddsOnBets());
    loopPromise = poll();
  })();

  return () => {
    stopped = true;
    disconnectObMqtt();
    void loopPromise;
  };
}
