import { describe, expect, test } from "vitest";
import {
  bestAskFromBook,
  buildPolymarketMappedMarket,
  decimalOddsFromProbability,
  mapPolymarketGameId,
  parseJsonArray,
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

  test("uses lowest non-empty ask as buy price", () => {
    expect(bestAskFromBook({
      asks: [
        { price: "0.62", size: "0" },
        { price: "0.58", size: "10" },
        { price: "0.6", size: "3" },
      ],
    })).toBe(0.58);
  });

  test("builds CollectMatchDto and CollectBetDto for team winner market", () => {
    const mapped = buildPolymarketMappedMarket(baseMarket, {
      "asset-home": { asks: [{ price: "0.5", size: "100" }] },
      "asset-away": { asks: [{ price: "0.25", size: "100" }] },
    });

    expect(mapped?.match).toMatchObject({
      Type: "Polymarket",
      SourceMatchID: "event-1",
      SourceGameID: "lol",
      Home: "Team Liquid",
      Away: "Fnatic",
    });
    expect(mapped?.bet).toMatchObject({
      Type: "Polymarket",
      SourceMatchID: "event-1",
      SourceBetID: "0xabc",
      Map: 0,
      BetName: "[全场] 获胜者",
      HomeOdds: 2,
      AwayOdds: 4,
      Status: "Normal",
    });
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
