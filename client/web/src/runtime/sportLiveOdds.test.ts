import { describe, expect, test } from "vitest";
import {
  pickSportSubscribeIds,
  SPORT_SUBSCRIBE_HARD_CAP,
} from "@/runtime/sportLiveOdds";
import { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";

function makeMatch(opts: {
  id: number;
  startAt: number;
  pmHome?: string;
  pmAway?: string;
  pfHomeM?: string;
  pfAwayM?: string;
}): ViewMatch {
  const m = Object.create(ViewMatch.prototype) as ViewMatch;
  m.id = opts.id;
  m.startAt = opts.startAt;
  m.bets = [];
  const bet = Object.create(ViewBet.prototype) as ViewBet;
  bet.items = [];
  if (opts.pmHome) {
    const item = Object.create(ViewBetItem.prototype) as ViewBetItem;
    item.type = "Polymarket";
    item.homeId = opts.pmHome;
    item.awayId = opts.pmAway || `${opts.pmHome}-a`;
    item.homeSubscribeId = item.homeId;
    item.awaySubscribeId = item.awayId;
    bet.items.push(item);
  }
  if (opts.pfHomeM) {
    const item = Object.create(ViewBetItem.prototype) as ViewBetItem;
    item.type = "PredictFun";
    item.homeId = "onchain-h";
    item.awayId = "onchain-a";
    item.homeSubscribeId = opts.pfHomeM;
    item.awaySubscribeId = opts.pfAwayM || opts.pfHomeM;
    bet.items.push(item);
  }
  m.bets.push(bet);
  return m;
}

describe("pickSportSubscribeIds", () => {
  test("filters outside past6h/future1h window", () => {
    const now = 1_700_000_000_000;
    const ok = makeMatch({ id: 1, startAt: now + 30 * 60_000, pmHome: "t1", pmAway: "t2" });
    const old = makeMatch({
      id: 2,
      startAt: now - 7 * 3600_000,
      pmHome: "old1",
      pmAway: "old2",
    });
    const pick = pickSportSubscribeIds([ok, old], 100, now);
    expect(pick.polymarketAssetIds.sort()).toEqual(["t1", "t2"]);
  });

  test("hard cap limits total tokens across PM+PF", () => {
    const now = 1_700_000_000_000;
    const matches = Array.from({ length: 80 }, (_, i) =>
      makeMatch({
        id: i,
        startAt: now + i * 1000,
        pmHome: `pm-h-${i}`,
        pmAway: `pm-a-${i}`,
        pfHomeM: `pf-h-${i}`,
        pfAwayM: `pf-a-${i}`,
      }),
    );
    const pick = pickSportSubscribeIds(matches, SPORT_SUBSCRIBE_HARD_CAP, now);
    const total = pick.polymarketAssetIds.length + pick.predictFunMarketIds.length;
    expect(total).toBe(SPORT_SUBSCRIBE_HARD_CAP);
  });

  test("skips PF single-market dual-outcome (same marketId both sides)", () => {
    const now = 1_700_000_000_000;
    const m = makeMatch({
      id: 1,
      startAt: now,
      pfHomeM: "same-mkt",
      pfAwayM: "same-mkt",
    });
    const pick = pickSportSubscribeIds([m], 100, now);
    expect(pick.predictFunMarketIds).toEqual([]);
  });
});
