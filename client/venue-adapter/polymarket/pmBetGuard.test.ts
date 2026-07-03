import { describe, expect, test, vi, beforeEach } from "vitest";
import { BetOption as BetOptionClass } from "@/models/betOption";
import { resolvePolymarketBetBlockReason } from "./pmBetGuard";
import { polymarketPluginGet } from "./transport";

vi.mock("./transport", () => ({
  polymarketPluginGet: vi.fn(),
}));

function option(extra: Record<string, unknown> = {}): BetOptionClass {
  const o = new BetOptionClass("Polymarket" as never, "m1", "b1", "token-home", 28, "Home", 4.762);
  Object.assign(o, {
    bet: { round: 0 },
    match: {
      startAt: Date.now() - 3600_000,
      providers: { Polymarket: "650650" },
      pmSport: {
        mapScore: { home: 1, away: 1 },
        bo: 3,
        updatedAt: Date.now() - 120_000,
        live: true,
      },
    },
    ...extra,
  });
  return o;
}

describe("resolvePolymarketBetBlockReason", () => {
  beforeEach(() => {
    vi.mocked(polymarketPluginGet).mockReset();
  });

  test("local pm_sport series decided blocks without gamma", async () => {
    const o = option({
      match: {
        startAt: Date.now() - 3600_000,
        pmSport: { mapScore: { home: 1, away: 2 }, bo: 3, updatedAt: Date.now() },
      },
    });
    const reason = await resolvePolymarketBetBlockReason(o);
    expect(reason).toContain("系列赛已决出");
    expect(polymarketPluginGet).not.toHaveBeenCalled();
  });

  test("gamma event 1-2 blocks when pm_sport stale", async () => {
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      if (url.includes("/events/650650")) {
        return {
          score: "000-000|1-2|Bo3",
          ended: false,
          live: false,
          period: "3/3",
        };
      }
      if (url.includes("/markets?")) {
        return [{
          clob_token_ids: JSON.stringify(["token-home", "token-away"]),
          outcomePrices: JSON.stringify(["0.21", "0.79"]),
        }];
      }
      throw new Error(url);
    });

    const reason = await resolvePolymarketBetBlockReason(option());
    expect(reason).toContain("Gamma");
    expect(reason).toContain("系列赛已决出");
  });

  test("outcomePrices blocks when buying heavy underdog token", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue([{
      clob_token_ids: JSON.stringify(["token-home", "token-away"]),
      outcomePrices: JSON.stringify(["0.0005", "0.9995"]),
      events: [{ score: "000-000|1-1|Bo3", live: true, period: "3/3" }],
    }]);

    const o = option({
      match: {
        startAt: Date.now() - 3600_000,
        pmSport: {
          mapScore: { home: 1, away: 1 },
          bo: 3,
          updatedAt: Date.now(),
          live: true,
        },
      },
    });

    const reason = await resolvePolymarketBetBlockReason(o);
    expect(reason).toMatch(/市场已决出胜负|几乎不可能/);
  });
});
