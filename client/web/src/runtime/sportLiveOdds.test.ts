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
  obMid?: string;
  obHome?: string;
}): ViewMatch {
  const m = Object.create(ViewMatch.prototype) as ViewMatch;
  m.id = opts.id;
  m.startAt = opts.startAt;
  m.providers = opts.obMid ? { OB: opts.obMid } : {};
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
  if (opts.obHome) {
    const item = Object.create(ViewBetItem.prototype) as ViewBetItem;
    item.type = "OB";
    item.homeSubscribeId = opts.obHome;
    item.awaySubscribeId = `${opts.obHome}-a`;
    bet.items.push(item);
  }
  m.bets.push(bet);
  return m;
}

describe("pickSportSubscribeIds", () => {
  test("filters outside past6h/future2h window", () => {
    const now = 1_700_000_000_000;
    const ok = makeMatch({ id: 1, startAt: now + 30 * 60_000, pmHome: "t1", pmAway: "t2" });
    const old = makeMatch({
      id: 2,
      startAt: now - 7 * 3600_000,
      pmHome: "old1",
      pmAway: "old2",
    });
    const later = makeMatch({
      id: 3,
      startAt: now + 3 * 3600_000,
      pmHome: "later1",
      pmAway: "later2",
    });
    const pick = pickSportSubscribeIds([ok, old, later], 100, now);
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

  test("collects OB mids for C8 subscribe", () => {
    const now = 1_700_000_000_000;
    const m = makeMatch({
      id: 1,
      startAt: now,
      obMid: "5650335",
      obHome: "oid-h",
    });
    const pick = pickSportSubscribeIds([m], 100, now);
    expect(pick.obMids).toEqual(["5650335"]);
    expect(pick.obOids.sort()).toEqual(["oid-h", "oid-h-a"]);
  });

  test("drops 19-digit OB bag ids from C8 mids", () => {
    const now = 1_700_000_000_000;
    const m = makeMatch({
      id: 1,
      startAt: now,
      obMid: "2097200625505820674",
      obHome: "oid-h",
    });
    const pick = pickSportSubscribeIds([m], 100, now);
    expect(pick.obMids).toEqual([]);
  });

  test("OB list oids fall back to homeId when subscribeId is empty", () => {
    const now = 1_700_000_000_000;
    const m = makeMatch({ id: 1, startAt: now, obMid: "5650335" });
    const item = Object.create(ViewBetItem.prototype) as ViewBetItem;
    item.type = "OB";
    item.homeId = "oid-from-http";
    item.awayId = "oid-away";
    item.homeSubscribeId = "";
    item.awaySubscribeId = "";
    m.bets[0].items.push(item);
    const pick = pickSportSubscribeIds([m], 100, now);
    expect(pick.obOids.sort()).toEqual(["oid-away", "oid-from-http"]);
    expect(pick.obMids).toEqual(["5650335"]);
  });
});
