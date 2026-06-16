import { describe, expect, it, vi } from "vitest";
import { createDefaultOddsApi } from "./default_odds.js";

describe("getMatchDefaultOdds", () => {
  it("returns stored initial odds when trimmed Map=0 snapshot is empty", async () => {
    const store = { "42:Home": 1.91, "42:Away": 1.84 };
    const readJson = vi.fn(() => ({ ...store }));
    const writeJson = vi.fn();
    const api = createDefaultOddsApi(readJson, writeJson);

    const buildMatchList = async () => [
      {
        ID: 1,
        Bets: [
          {
            ID: 42,
            Map: 0,
            Sources: {
              OB: { Type: "OB", HomeOdds: 0, AwayOdds: 0, Status: "Normal" },
            },
          },
        ],
      },
    ];

    const out = await api.getMatchDefaultOdds([1], buildMatchList);
    expect(out["42:Home"]).toBe(1.91);
    expect(out["42:Away"]).toBe(1.84);
  });

  it("backfills Map=0 default odds from platform_bets when trimmed snapshot is empty", async () => {
    const readJson = vi.fn(() => ({}));
    const writeJson = vi.fn();
    const api = createDefaultOddsApi(readJson, writeJson);

    const buildMatchList = async () => [
      {
        ID: 129,
        Matchs: { IA: "373813", OB: "5600758540935049", RAY: "38398767" },
        Bets: [
          {
            ID: 471807813,
            Map: 0,
            Sources: {
              OB: { Type: "OB", HomeOdds: 0, AwayOdds: 0, Status: "Locked" },
            },
          },
        ],
      },
    ];

    const fetchPlatformBets = async () => ({
      "IA:373813": {
        bets: [
          { Map: 0, HomeOdds: 1.55, AwayOdds: 2.35 },
          { Map: 1, HomeOdds: 9, AwayOdds: 9 },
        ],
      },
      "RAY:38398767": {
        bets: [{ Map: 0, HomeOdds: 1.6, AwayOdds: 2.24 }],
      },
    });

    const out = await api.getMatchDefaultOdds([129], buildMatchList, fetchPlatformBets);
    expect(out["471807813:Home"]).toBe(1.6);
    expect(out["471807813:Away"]).toBe(2.35);
    expect(writeJson).toHaveBeenCalledWith(
      "default_odds",
      expect.objectContaining({
        "471807813:Home": 1.6,
        "471807813:Away": 2.35,
      }),
    );
  });
});
