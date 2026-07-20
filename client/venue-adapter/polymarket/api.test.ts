import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchPolymarketEsportsMarkets,
  POLYMARKET_COLLECT_FUTURE_MS,
  POLYMARKET_GAMMA_API,
  polymarketCollectStartTimeAllowed,
} from "./api";
import { polymarketPluginGet } from "./transport";

vi.mock("./transport", () => ({
  polymarketPluginGet: vi.fn(),
}));

describe("Polymarket API discovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T07:50:00.000Z"));
    vi.mocked(polymarketPluginGet).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("uses official sports metadata and keyset events to discover esports events", async () => {
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.origin !== POLYMARKET_GAMMA_API) return [];
      if (parsed.pathname === "/sports") {
        return [
          { sport: "cs2", series: "10310" },
          { sport: "lol", series: "10311" },
          { sport: "football", series: "ignored" },
        ];
      }
      if (parsed.pathname === "/events/keyset") {
        expect(parsed.searchParams.get("order")).toBe("startTime");
        expect(parsed.searchParams.get("ascending")).toBe("true");
        expect(parsed.searchParams.get("closed")).toBe("false");
        expect(parsed.searchParams.getAll("series_id")).toEqual(["10310", "10311"]);
        const live = parsed.searchParams.get("live");
        if (live === "true") {
          expect(parsed.searchParams.get("start_time_min")).toBeNull();
        }
        else {
          expect(parsed.searchParams.get("start_time_min")).toBe("2026-06-25T07:50:00.000Z");
          expect(parsed.searchParams.get("start_time_max")).toBe("2026-06-25T08:50:00.000Z");
        }
        return {
          data: [{
            id: "618798",
            slug: "cs2-nvq-run2-2026-06-25",
            title: "Counter-Strike: Team Novaq vs Rune Eaters (BO3)",
            startTime: "2026-06-25T06:00:00Z",
            seriesSlug: "counter-strike",
            tags: [{ label: "Esports" }, { label: "counter strike 2" }],
            markets: [{
              id: "2628951",
              conditionId: "0x8773",
              question: "Counter-Strike: Team Novaq vs Rune Eaters (BO3)",
              groupItemTitle: "Match Winner",
              sportsMarketType: "moneyline",
              active: true,
              closed: false,
              archived: false,
              acceptingOrders: true,
              outcomes: JSON.stringify(["Team Novaq", "Rune Eaters"]),
              clobTokenIds: JSON.stringify(["asset-novaq", "asset-rune"]),
            }],
          }],
          next_cursor: null,
        };
      }
      return [];
    });

    const markets = await fetchPolymarketEsportsMarkets(200);

    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({
      id: "2628951",
      question: "Counter-Strike: Team Novaq vs Rune Eaters (BO3)",
      events: [{ slug: "cs2-nvq-run2-2026-06-25" }],
    });
    expect(vi.mocked(polymarketPluginGet).mock.calls.map(call => new URL(call[0]).pathname)).toEqual([
      "/sports",
      "/events/keyset",
      "/events/keyset",
    ]);
  });

  test("dedupes markets returned by live and upcoming keyset passes", async () => {
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/sports")
        return [{ sport: "cs2", series: "10310" }];
      if (parsed.pathname === "/events/keyset") {
        const event = {
          id: "618798",
          slug: "cs2-nvq-run2-2026-06-25",
          tags: [{ label: "Counter-Strike" }],
          markets: [{
            id: "2628951",
            conditionId: "0x8773",
            question: "Counter-Strike: Team Novaq vs Rune Eaters",
            groupItemTitle: "Match Winner",
            sportsMarketType: "moneyline",
            outcomes: JSON.stringify(["Team Novaq", "Rune Eaters"]),
            clobTokenIds: JSON.stringify(["asset-novaq", "asset-rune"]),
          }],
        };
        return { data: [event], next_cursor: null };
      }
      return [];
    });

    const markets = await fetchPolymarketEsportsMarkets(200);

    expect(markets).toHaveLength(1);
    expect(vi.mocked(polymarketPluginGet).mock.calls.filter(call => call[0].includes("/events/keyset"))).toHaveLength(2);
  });
});

describe("polymarketCollectStartTimeAllowed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T07:50:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("allows any past start and rejects beyond +1h", () => {
    const now = Date.now();
    expect(polymarketCollectStartTimeAllowed(now - 24 * 3600 * 1000)).toBe(true);
    expect(polymarketCollectStartTimeAllowed(now + POLYMARKET_COLLECT_FUTURE_MS)).toBe(true);
    expect(polymarketCollectStartTimeAllowed(now + POLYMARKET_COLLECT_FUTURE_MS + 1)).toBe(false);
  });
});
