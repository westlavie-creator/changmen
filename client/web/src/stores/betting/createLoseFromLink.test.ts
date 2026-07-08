import type { ViewMatch } from "@/models/match";
import { describe, expect, it } from "vitest";
import { resolveMatchBetForOrderRows } from "@/stores/betting/createLoseFromLink";

describe("resolveMatchBetForOrderRows", () => {
  const matches = [
    {
      id: 10,
      title: "Team A vs Team B",
      bets: [{ id: 100, getBetName: () => "[地图1] 获胜" }],
    },
  ] as unknown as ViewMatch[];

  it("resolves match and bet from order group rows", () => {
    const resolved = resolveMatchBetForOrderRows(matches, [
      { OrderID: "o1", Link: 999, Match: "Team A vs Team B", Bet: "[地图1] 获胜", Type: "OB" },
    ]);
    expect(resolved?.match.id).toBe(10);
    expect(resolved?.bet.id).toBe(100);
  });

  it("skips synthetic makeup rows when picking sample", () => {
    const resolved = resolveMatchBetForOrderRows(matches, [
      { OrderID: "makeup-1", Status: "Makeup", Match: "x", Bet: "y" },
      { OrderID: "o1", Match: "Team A vs Team B", Bet: "[地图1] 获胜" },
    ]);
    expect(resolved?.bet.id).toBe(100);
  });
});
