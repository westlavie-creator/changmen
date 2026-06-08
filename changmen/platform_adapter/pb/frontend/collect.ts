import { getCollectPlatform, getGames } from "@/api/esport";
import { pbGet } from "./transport";
import { resolvePbAccount } from "./transport";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import { PLATFORMS } from "@/shared/platform";
import { parseEuroOddsPayload, pbOddsUrl, pbTeamLogo, slugify } from "./parse";
import { setPbLineId } from "./lineCache";
import { wait } from "@/shared/wait";
import { notifyCollectError } from "@platform/shared/collectNotify";
import { useCollectStore } from "@/stores/collectStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useMatchStore } from "@/stores/matchStore";

const PLATFORM = PLATFORMS.PB;
const POLL_MS = 5_000;
const SAVE_MS = 60_000;

export function startPbCollector(): () => void {
  let stopped = false;
  let lastSaveAt = 0;

  const odds = useOddsStore();
  const collect = useCollectStore();
  const matchStore = useMatchStore();

  const poll = async () => {
    while (!stopped) {
      const started = Date.now();
      let matchCount = 0;
      try {
        const platform = await getCollectPlatform(PLATFORM);
        if (!platform) {
          await wait(POLL_MS);
          continue;
        }

        const account = resolvePbAccount();
        if (!account) {
          console.log(PLATFORM, "当前未检测到账号");
          odds.clean(PLATFORM);
          await wait(3_000);
          continue;
        }

        const games = await getGames(PLATFORM);
        const allowedSlugs = games.map(slugify);
        const url = pbOddsUrl(account.gateway!);
        const data = await pbGet<Record<string, unknown>>(account, url);
        const { matches } = parseEuroOddsPayload(data, { allowedSlugs });
        matchCount = matches.length;

        const shouldSave = Date.now() - lastSaveAt > SAVE_MS;
        const matchPayload: CollectMatchDto[] = [];
        const betsByMatch = new Map<string, CollectBetDto[]>();
        const now = Date.now();

        for (const row of matches) {
          const bets: CollectBetDto[] = [];
          for (const stage of row.stages) {
            if (stage.winLineId) setPbLineId(stage.winMarketId, stage.winLineId);
            const locked = stage.winLocked;
            odds.save(PLATFORM, {
              id: stage.winHomeId,
              odds: stage.winHome,
              isLock: locked,
              betId: stage.winMarketId,
              time: now,
            });
            odds.save(PLATFORM, {
              id: stage.winAwayId,
              odds: stage.winAway,
              isLock: locked,
              betId: stage.winMarketId,
              time: now,
            });

            bets.push({
              Type: PLATFORM,
              SourceMatchID: row.matchId,
              SourceBetID: stage.winMarketId,
              Map: stage.stageId,
              BetName: stage.betName,
              SourceHomeID: stage.winHomeId,
              HomeName: row.home.name,
              HomeOdds: stage.winHome,
              SourceAwayID: stage.winAwayId,
              AwayName: row.away.name,
              AwayOdds: stage.winAway,
              Status: locked ? "Locked" : "Normal",
            });
          }

          matchPayload.push({
            Type: PLATFORM,
            SourceMatchID: row.matchId,
            SourceGameID: row.gameId,
            BO: row.bo,
            StartTime: row.startTime,
            Home: row.home.name,
            HomeID: row.home.id,
            Away: row.away.name,
            AwayID: row.away.id,
            Teams: [
              {
                Type: PLATFORM,
                GameID: row.gameId,
                Name: row.home.name,
                TeamID: row.home.id,
                Logo: pbTeamLogo(row.gameId, row.home.englishName),
              },
              {
                Type: PLATFORM,
                GameID: row.gameId,
                Name: row.away.name,
                TeamID: row.away.id,
                Logo: pbTeamLogo(row.gameId, row.away.englishName),
              },
            ],
          });
          betsByMatch.set(row.matchId, bets);
        }

        if (shouldSave && matchPayload.length) {
          const saved = await collect.saveMatch(PLATFORM, matchPayload);
          if (saved) {
            await Promise.all(
              [...betsByMatch.entries()]
                .filter(([, bets]) => bets.length)
                .map(([matchId, bets]) => collect.saveBets(PLATFORM, matchId, bets)),
            );
            lastSaveAt = Date.now();
          }
        }

        matchStore.refreshOddsOnBets();
      } catch (err) {
        console.warn("[PB] collect error", err);
        notifyCollectError("PB", err);
      } finally {
        console.debug(`[PB]比赛列表:${Date.now() - started}ms，读取比赛:${matchCount}场`);
        await wait(POLL_MS);
      }
    }
  };

  void poll();

  return () => {
    stopped = true;
  };
}
