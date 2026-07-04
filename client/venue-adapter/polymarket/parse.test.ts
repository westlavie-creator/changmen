import { describe, expect, test } from "vitest";
import {
  bestAskFromBook,
  bestBidFromBook,
  estimatePolymarketSellProceedsUsdc,
  polymarketUnrealizedProfitUsdc,
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  mapPolymarketGameId,
  normalizePolymarketTeamName,
  parseJsonArray,
  sourceTeamId,
  type PolymarketRawMarket,
} from "./parse";

const baseMarket: PolymarketRawMarket = {
  id: "m1",
  condition_id: "0xabc",
  active: true,
  closed: false,
  archived: false,
  accepting_orders: true,
  question: "League of Legends match winner: Team Liquid vs Fnatic",
  sports_market_type: "moneyline",
  groupItemTitle: "Match Winner",
  startDate: "2026-01-02T03:04:05.000Z",
  outcomes: JSON.stringify(["Team Liquid", "Fnatic"]),
  clob_token_ids: JSON.stringify(["asset-home", "asset-away"]),
  tags: [{ label: "esports" }, { label: "lol" }],
  events: [{ id: "event-1", title: "LoL: Team Liquid vs Fnatic" }],
};

describe("Polymarket parse", () => {
  test("parses JSON array fields", () => {
    expect(parseJsonArray("[\"a\",\"b\"]")).toEqual(["a", "b"]);
    expect(parseJsonArray(["a", 2])).toEqual(["a", "2"]);
    expect(parseJsonArray("not-json")).toEqual([]);
  });

  test("maps supported game ids from tags and title", () => {
    expect(mapPolymarketGameId(baseMarket)).toBe("lol");
    expect(mapPolymarketGameId({
      ...baseMarket,
      tags: ["Counter-Strike"],
      question: "CS2 winner",
      events: [{ id: "cs-event", seriesSlug: "counter-strike", title: "Counter-Strike: G2 vs Liquid" }],
    })).toBe("cs2");
    expect(mapPolymarketGameId({
      ...baseMarket,
      tags: [],
      question: "Map 1 Winner",
      events: [{ id: "dota-event", seriesSlug: "dota-2" }],
    })).toBe("dota2");
    expect(mapPolymarketGameId({
      ...baseMarket,
      tags: [],
      question: "Honor of Kings: TOP Esports Armor vs SYGaming",
      sportsMarketType: "moneyline",
      events: [{ seriesSlug: "honor-of-kings", eventMetadata: { league: "King Pro League" } }],
    })).toBe("kog");
  });

  test("converts probability price to decimal odds", () => {
    expect(decimalOddsFromProbability("0.5")).toBe(2);
    expect(decimalOddsFromProbability(0.25)).toBe(4);
    expect(decimalOddsFromProbability(0)).toBe(0);
    expect(decimalOddsFromProbability(1)).toBe(0);
  });

  test("truncates decimal odds to 3 digits without rounding", () => {
    expect(decimalOddsFromProbability(0.37)).toBe(2.702);
    expect(decimalOddsFromProbability(0.333)).toBe(3.003);
  });

  test("builds stable team ids by game and normalized team name", () => {
    expect(normalizePolymarketTeamName("Virtus.pro")).toBe("virtus-pro");
    expect(sourceTeamId("dota2", "Virtus.pro")).toBe("dota2:virtus-pro");
    expect(sourceTeamId("dota2", "  Virtus Pro  ")).toBe("dota2:virtus-pro");
  });

  test("uses lowest non-empty ask as buy price", () => {
    expect(bestAskFromBook({
      asks: [
        { price: "0.62", size: "0" },
        { price: "0.58", size: "10" },
        { price: "0.6", size: "3" },
      ],
    })).toBe(0.58);
  });

  test("uses highest non-empty bid as sell price", () => {
    expect(bestBidFromBook({
      bids: [
        { price: "0.55", size: "5" },
        { price: "0.61", size: "2" },
        { price: "0.59", size: "0" },
      ],
    })).toBe(0.61);
  });

  test("estimates sell proceeds and unrealized profit", () => {
    const bids = [
      { price: 0.8, size: 2 },
      { price: 0.7, size: 10 },
    ];
    expect(estimatePolymarketSellProceedsUsdc(bids, 5)).toBe(3.7);
    expect(polymarketUnrealizedProfitUsdc(bids, 5, 5)).toBe(-1.3);
  });

  test("builds CollectMatchDto and CollectBetDto for team winner market", () => {
    const mapped = buildPolymarketMappedMarket(baseMarket, {
      "asset-home": 0.5,
      "asset-away": 0.25,
    });

    expect(mapped?.match).toMatchObject({
      Type: "Polymarket",
      SourceMatchID: "event-1",
      SourceGameID: "lol",
      HomeID: "lol:team-liquid",
      Home: "Team Liquid",
      AwayID: "lol:fnatic",
      Away: "Fnatic",
    });
    expect(mapped?.match.Teams).toEqual([
      { Type: "Polymarket", TeamID: "lol:team-liquid", Name: "Team Liquid", GameID: "lol", Logo: "" },
      { Type: "Polymarket", TeamID: "lol:fnatic", Name: "Fnatic", GameID: "lol", Logo: "" },
    ]);
    expect(mapped?.bet).toMatchObject({
      Type: "Polymarket",
      SourceMatchID: "event-1",
      SourceBetID: "0xabc",
      Map: 0,
      BetName: "[全场] 获胜者",
      SourceHomeID: "asset-home",
      HomeOdds: 2,
      SourceAwayID: "asset-away",
      AwayOdds: 4,
      Status: "Normal",
    });
  });

  test("keeps team ids stable across different event ids while CLOB token ids vary", () => {
    const first = buildPolymarketMappedMarket({
      ...baseMarket,
      condition_id: "0xfirst",
      clob_token_ids: JSON.stringify(["asset-first-home", "asset-first-away"]),
      events: [{ id: "event-first", title: "LoL: Team Liquid vs Fnatic" }],
    });
    const second = buildPolymarketMappedMarket({
      ...baseMarket,
      condition_id: "0xsecond",
      clob_token_ids: JSON.stringify(["asset-second-home", "asset-second-away"]),
      events: [{ id: "event-second", title: "LoL: Team Liquid vs Fnatic" }],
    });

    expect(first?.match.SourceMatchID).toBe("event-first");
    expect(second?.match.SourceMatchID).toBe("event-second");
    expect(first?.match.HomeID).toBe("lol:team-liquid");
    expect(second?.match.HomeID).toBe("lol:team-liquid");
    expect(first?.match.AwayID).toBe("lol:fnatic");
    expect(second?.match.AwayID).toBe("lol:fnatic");
    expect(first?.bet.SourceHomeID).toBe("asset-first-home");
    expect(second?.bet.SourceHomeID).toBe("asset-second-home");
    expect(first?.bet.SourceAwayID).toBe("asset-first-away");
    expect(second?.bet.SourceAwayID).toBe("asset-second-away");
  });

  test("builds map winner market under the same event match", () => {
    const mapped = buildPolymarketMappedMarket({
      ...baseMarket,
      id: "m-map1",
      condition_id: "0xmap1",
      question: "League of Legends: Team Liquid vs Fnatic - Map 1 Winner",
      sports_market_type: "child_moneyline",
      groupItemTitle: "Map 1 Winner",
      clob_token_ids: JSON.stringify(["asset-map1-home", "asset-map1-away"]),
    });

    expect(mapped?.match.SourceMatchID).toBe("event-1");
    expect(mapped?.bet).toMatchObject({
      SourceMatchID: "event-1",
      SourceBetID: "0xmap1",
      Map: 1,
      BetName: "[地图1] 获胜者",
      SourceHomeID: "asset-map1-home",
      SourceAwayID: "asset-map1-away",
      Status: "Locked",
    });

    const gameWinner = buildPolymarketMappedMarket({
      ...baseMarket,
      id: "m-game2",
      condition_id: "0xgame2",
      question: "Dota 2: Carstensz vs Mentality Monster - Game 2 Winner",
      sports_market_type: "child_moneyline",
      groupItemTitle: "Game 2 Winner",
      clob_token_ids: JSON.stringify(["asset-game2-home", "asset-game2-away"]),
      tags: [],
      events: [{ id: "dota-event", seriesSlug: "dota-2" }],
    });

    expect(gameWinner?.bet).toMatchObject({
      SourceMatchID: "dota-event",
      SourceBetID: "0xgame2",
      Map: 2,
      BetName: "[地图2] 获胜者",
      SourceHomeID: "asset-game2-home",
      SourceAwayID: "asset-game2-away",
    });
  });

  test("filters generic Yes/No markets and locks missing asks", () => {
    expect(buildPolymarketMappedMarket({
      ...baseMarket,
      outcomes: JSON.stringify(["Yes", "No"]),
    })).toBeNull();

    const mapped = buildPolymarketMappedMarket(baseMarket);
    expect(mapped?.bet.Status).toBe("Locked");
    expect(mapped?.bet.HomeOdds).toBe(0);
  });
});
