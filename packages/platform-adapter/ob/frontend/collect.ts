import { getCollectPlatform, getGames, saveLiveTimer, updatePlatform } from "@/api/esport";
import { OB_DEMO_LOGIN_URL } from "@/api/v4";
import { getObBetNameRe } from "./parse";

import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog.browser";
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

/** ?? A8 v0???? device=2?PC=1 */
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

/** ?? A8 e9????????????Nr.get ?? CDN??*/
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

/** ?? URL????ensureObTeamLogosLoaded??*/
export function resolveObTeamLogoSync(teamId: string): string {
  if (!teamLogos || !teamLogos[teamId]) return "";
  return `https://uphw-cdn6.peyesight.com/${teamLogos[teamId]}`;
}

/** ?? A8 e9????CDN */
export async function resolveObTeamLogo(teamId: string): Promise<string> {
  await ensureObTeamLogosLoaded();
  return resolveObTeamLogoSync(teamId);
}

/** ?? A8 $Me????token ?????????????? */
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

/** [changmen ??] getTimer ????is_live=2 ??????????h+a+1? */
export function inferLiveRoundFromObIndexRow(row: Record<string, unknown>): number {
  if (num(row.is_live) !== 2) return 0;
  const score = String(row.score ?? "0:0").replace(/\s/g, "");
  const m = score.match(/^(\d+):(\d+)$/);
  const home = m ? num(m[1]) : 0;
  const away = m ? num(m[2]) : 0;
  const round = Math.max(1, home + away + 1);
  const bo = num(row.bo);
  return bo > 0 ? Math.min(round, bo) : round;
}

/** ?? A8 MMe??? live timer?index is_live=2 ???getTimer ???? score ?? */
export async function syncObLiveTimer(
  platform: CollectPlatformInfo,
  indexRows?: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  const indexById = new Map(
    (indexRows ?? []).map((row) => [String(row.id ?? ""), row]),
  );
  const res = await collectObGet<{
    status: string;
    data?: Record<string, Record<string, unknown>>;
  }>(platform, "game/getTimer", "");

  const byId = new Map<string, { MatchID: string | number; Round: number; StartTime: number }>();
  if (res.status === "true" && res.data) {
    for (const row of Object.values(res.data)) {
      const matchId = row.match_id;
      const mid = String(matchId ?? "");
      if (!mid) continue;
      const idx = indexById.get(mid);
      if (indexById.size && !idx) continue;
      if (indexById.size && num(idx?.is_live) !== 2) continue;
      byId.set(mid, {
        MatchID: matchId as string | number,
        Round: num(row.round),
        StartTime: num(row.start_time) * 1000,
      });
    }
  }

  for (const row of indexRows ?? []) {
    if (num(row.is_live) !== 2) continue;
    const mid = String(row.id ?? "");
    if (!mid) continue;
    const inferred = inferLiveRoundFromObIndexRow(row);
    if (inferred <= 0) continue;
    const existing = byId.get(mid);
    if (existing && num(existing.Round) > 0) continue;
    byId.set(mid, {
      MatchID: row.id as string | number,
      Round: inferred,
      StartTime: num(existing?.StartTime) > 0 ? num(existing!.StartTime) : Date.now(),
    });
  }

  await saveLiveTimer(PLATFORMS.OB, [...byId.values()]);
  // ?? A8?timer ????????GetMatchs???? 30s ??
  void useMatchStore().fetchMatches(true);
}

/** game/index ???? match_team ?????? */
export function teamsFromListRow(row: Record<string, unknown>): [string, string] {
  const teams = String(row.match_team ?? "")
    .replace(/&nbsp;/g, " ")
    .split(",");
  return [teams[0] ?? "", teams[1] ?? ""];
}

/** game/index ?? ??Client_SaveMatch ?? */
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
      IsLive: num(row.is_live),
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

        await syncObLiveTimer(platform, rawList);
      } catch (err) {
        console.warn("[OB] collect error", err);
        notifyCollectError("OB", err);
      } finally {
        console.debug(`[OB]????:${Date.now() - started}ms??????${matchCount}?`);
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
